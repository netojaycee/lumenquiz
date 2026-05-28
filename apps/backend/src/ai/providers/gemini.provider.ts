import { Injectable } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'

@Injectable()
export class GeminiProvider {
  private readonly baseUrl = 'https://generativelanguage.googleapis.com/v1beta'

  constructor(private readonly config: ConfigService) {}

  isConfigured(): boolean {
    return !!this.config.get<string>('GEMINI_API_KEY')
  }

  // Each model has its own free-tier quota bucket — trying all three maximises availability
  private readonly models = [
    'gemini-2.0-flash-lite',
    'gemini-1.5-flash-8b',
    'gemini-1.5-flash',
  ]

  async generate(prompt: string): Promise<string> {
    const apiKey = this.config.get<string>('GEMINI_API_KEY')
    if (!apiKey) throw new Error('GEMINI_API_KEY not set')

    let lastError = ''
    for (const model of this.models) {
      const result = await this.tryModel(apiKey, model, prompt)
      if (result.ok) return result.text
      if (result.retryAfterMs !== null) {
        // Rate-limited but within a short wait — retry this model once
        await new Promise((r) => setTimeout(r, result.retryAfterMs!))
        const retry = await this.tryModel(apiKey, model, prompt)
        if (retry.ok) return retry.text
        lastError = retry.error
      } else {
        lastError = result.error
      }
      // 429 quota exhausted for this model → try the next one
    }
    throw new Error(`Gemini: all models failed. Last error: ${lastError}`)
  }

  private async tryModel(
    apiKey: string,
    model: string,
    prompt: string,
  ): Promise<{ ok: true; text: string } | { ok: false; error: string; retryAfterMs: number | null }> {
    const res = await fetch(
      `${this.baseUrl}/models/${model}:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { responseMimeType: 'application/json', temperature: 0.7 },
        }),
        signal: AbortSignal.timeout(60_000),
      },
    )

    if (res.ok) {
      const data = (await res.json()) as {
        candidates: Array<{ content: { parts: Array<{ text: string }> } }>
      }
      return { ok: true, text: data.candidates[0].content.parts[0].text }
    }

    const body = await res.text()

    if (res.status === 429) {
      // Parse "retry in Xs" from the message — only wait if ≤ 30 s
      const match = body.match(/retry in ([\d.]+)s/i)
      const delaySec = match ? parseFloat(match[1]) : null
      const retryAfterMs = delaySec !== null && delaySec <= 30 ? Math.ceil(delaySec * 1000) + 500 : null
      return { ok: false, error: `${model} 429 rate-limited`, retryAfterMs }
    }

    return { ok: false, error: `Gemini HTTP ${res.status} (${model}): ${body}`, retryAfterMs: null }
  }
}
