import Anthropic from '@anthropic-ai/sdk';
import { FaqEntry } from '../types/index.js';

const anthropic = new Anthropic();

export interface FaqMatchResult {
  matched: boolean;
  answer: string | null;
  matchedFaqId: number | null;
  confidence: 'high' | 'low' | 'none';
}

export async function matchFaq(
  question: string,
  faqEntries: FaqEntry[]
): Promise<FaqMatchResult> {
  if (faqEntries.length === 0) {
    return { matched: false, answer: null, matchedFaqId: null, confidence: 'none' };
  }

  const faqList = faqEntries
    .map((f) => `[ID:${f.id}] Q: ${f.question}\nA: ${f.answer}`)
    .join('\n\n');

  const message = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 512,
    messages: [{
      role: 'user',
      content: `You are a property assistant for a short-term rental. A guest asked a question. Match it to the most relevant FAQ entry and provide a friendly, concise answer based on the FAQ content.

FAQ entries for this property:
${faqList}

Guest question: "${question}"

Respond with JSON only:
{"matched": true/false, "faq_id": <matched FAQ entry ID or null>, "answer": "<friendly answer based on FAQ content or null if no match>", "confidence": "high"/"low"/"none"}

Rules:
- "high" confidence: question clearly maps to an FAQ entry
- "low" confidence: question is somewhat related but answer may be incomplete
- "none": no relevant FAQ entry exists
- If matched, rephrase the FAQ answer in a friendly, conversational tone
- If not matched, set matched to false and answer to null`
    }]
  });

  try {
    const text = message.content[0].type === 'text' ? message.content[0].text : '';
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return { matched: false, answer: null, matchedFaqId: null, confidence: 'none' };
    const parsed = JSON.parse(jsonMatch[0]);
    return {
      matched: Boolean(parsed.matched),
      answer: parsed.answer || null,
      matchedFaqId: parsed.faq_id || null,
      confidence: parsed.confidence || 'none',
    };
  } catch {
    return { matched: false, answer: null, matchedFaqId: null, confidence: 'none' };
  }
}
