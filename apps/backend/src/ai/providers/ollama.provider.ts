import { Injectable } from '@nestjs/common'

interface OllamaModel {
  name: string
}

@Injectable()
export class OllamaProvider {
  private readonly baseUrl = 'http://localhost:11434'
  private cachedModel: string | null = null

  async isAvailable(): Promise<boolean> {
    try {
      const res = await fetch(`${this.baseUrl}/api/tags`, {
        signal: AbortSignal.timeout(3000),
      })
      if (!res.ok) return false
      const data = (await res.json()) as { models?: OllamaModel[] }
      const models = data.models ?? []
      if (models.length === 0) return false
      this.cachedModel = this.selectModel(models.map((m) => m.name))
      return true
    } catch {
      return false
    }
  }

  private selectModel(names: string[]): string {
    const preferred = ['llama3', 'llama3.2', 'llama3.1', 'llama2', 'mistral', 'gemma', 'phi']
    for (const prefix of preferred) {
      const match = names.find((n) => n.toLowerCase().startsWith(prefix))
      if (match) return match
    }
    return names[0]
  }

  async generate(prompt: string): Promise<string> {
    if (!this.cachedModel) {
      const up = await this.isAvailable()
      if (!up || !this.cachedModel) throw new Error('Ollama not available')
    }
    const res = await fetch(`${this.baseUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: this.cachedModel,
        messages: [{ role: 'user', content: prompt }],
        stream: false,
        format: 'json',
        options: { temperature: 0.7 },
      }),
      signal: AbortSignal.timeout(120_000),
    })
    if (!res.ok) throw new Error(`Ollama HTTP ${res.status}`)
    const data = (await res.json()) as { message: { content: string } }
    return data.message.content
  }
}
