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

export async function downloadTelegramPhoto(fileLink: string): Promise<string> {
  const response = await fetch(fileLink);
  const buffer = Buffer.from(await response.arrayBuffer());
  return buffer.toString('base64');
}
