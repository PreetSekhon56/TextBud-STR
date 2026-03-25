import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic();

export interface PhotoComparisonResult {
  pass: boolean;
  issues: string[];
}

export async function comparePhotos(
  stagingBase64: string,
  milestoneBase64: string,
  roomName: string
): Promise<PhotoComparisonResult> {
  const message = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 1024,
    messages: [{
      role: 'user',
      content: [
        { type: 'text', text: 'Reference photo (how this room should look after cleaning):' },
        { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: stagingBase64 } },
        { type: 'text', text: `Current photo of ${roomName} submitted by cleaner:` },
        { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: milestoneBase64 } },
        {
          type: 'text',
          text: `Compare the current photo to the reference staging photo for ${roomName}. Focus on cleanliness, organization, and whether the room matches the expected standard. Respond with JSON only: {"pass": true/false, "issues": ["issue1", "issue2"]}. Be reasonably lenient -- minor differences in angle or lighting are fine. Flag only genuine cleanliness or organization issues.`
        }
      ]
    }]
  });

  try {
    const text = message.content[0].type === 'text' ? message.content[0].text : '';
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return { pass: false, issues: ['Could not parse AI response'] };
    const parsed = JSON.parse(jsonMatch[0]);
    return { pass: Boolean(parsed.pass), issues: Array.isArray(parsed.issues) ? parsed.issues : [] };
  } catch {
    return { pass: false, issues: ['Could not parse AI response'] };
  }
}

export async function analyzeReceipt(receiptBase64: string): Promise<{ items: { name: string; quantity: number }[] }> {
  const message = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 1024,
    messages: [{
      role: 'user',
      content: [
        { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: receiptBase64 } },
        {
          type: 'text',
          text: 'Extract cleaning supply items from this store receipt. Return JSON only: {"items": [{"name": "item name", "quantity": 1}]}. Focus on: toilet paper, trash bags, soap, paper towels, cleaning products, laundry supplies, sponges. Ignore non-cleaning items like food.'
        }
      ]
    }]
  });
  try {
    const text = message.content[0].type === 'text' ? message.content[0].text : '';
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return { items: [] };
    return JSON.parse(jsonMatch[0]);
  } catch {
    return { items: [] };
  }
}

export async function analyzeInventoryPhoto(photoBase64: string, itemName: string): Promise<{ estimatedCount: number | null; description: string }> {
  const message = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 512,
    messages: [{
      role: 'user',
      content: [
        { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: photoBase64 } },
        {
          type: 'text',
          text: `This is a photo of "${itemName}" in a supply closet. Estimate how many units are visible. Return JSON only: {"estimatedCount": <number or null>, "description": "brief description of what you see"}`
        }
      ]
    }]
  });
  try {
    const text = message.content[0].type === 'text' ? message.content[0].text : '';
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return { estimatedCount: null, description: 'Could not analyze photo' };
    return JSON.parse(jsonMatch[0]);
  } catch {
    return { estimatedCount: null, description: 'Could not analyze photo' };
  }
}

export async function downloadTelegramPhoto(fileLink: string): Promise<string> {
  const response = await fetch(fileLink);
  const buffer = Buffer.from(await response.arrayBuffer());
  return buffer.toString('base64');
}
