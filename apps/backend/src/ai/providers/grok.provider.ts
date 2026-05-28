import { Injectable } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'

// Groq (console.groq.com) — free tier, OpenAI-compatible, keys start with gsk_
// Accepts GROQ_API_KEY or GROK_API_KEY (backward compat)
@Injectable()
export class GrokProvider {
  private readonly baseUrl = 'https://api.groq.com/openai/v1'

  constructor(private readonly config: ConfigService) {}

  isConfigured(): boolean {
    return !!(this.config.get<string>('GROQ_API_KEY') ?? this.config.get<string>('GROK_API_KEY'))
  }

  async generate(prompt: string): Promise<string> {
    const apiKey = this.config.get<string>('GROQ_API_KEY') ?? this.config.get<string>('GROK_API_KEY')
    if (!apiKey) throw new Error('GROQ_API_KEY not set')

    const res = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        messages: [{ role: 'user', content: prompt }],
        response_format: { type: 'json_object' },
        temperature: 0.7,
      }),
      signal: AbortSignal.timeout(60_000),
    })
    if (!res.ok) {
      const body = await res.text()
      throw new Error(`Groq HTTP ${res.status}: ${body}`)
    }
    const data = (await res.json()) as { choices: Array<{ message: { content: string } }> }
    return data.choices[0].message.content
  }
}
