import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenerativeAI } from '@google/generative-ai';

const genAI = new GoogleGenerativeAI(process.env.NEXT_PUBLIC_GEMINI_API_KEY || '');

export async function POST(request: NextRequest) {
  try {
    const { uid, profile } = await request.json();

    if (!uid || !profile) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const model = genAI.getGenerativeModel({ model: 'gemini-flash-latest' });

    const prompt = `
You are a project suggestion AI. Based on the user's profile, suggest 3 diverse project ideas.

User profile:
- Skills: ${profile.skills?.join(', ') || 'general programming'}
- Preferred Tech: ${profile.preferredTech?.join(', ') || 'any'}
- Experience: ${profile.experience || 'beginner'}
- Time Budget: ${profile.timeBudget || 'flexible'}

Generate 3 project ideas that:
1. Match the user's skill level
2. Use their preferred technologies
3. Are achievable within their time budget
4. Provide good learning opportunities

Return ONLY a JSON array with this structure:
[
  {
    "title": "Project Name",
    "description": "Brief 2-3 sentence description of what the project does and why it's valuable",
    "difficulty": "beginner" | "intermediate" | "advanced",
    "estimatedTime": "e.g., 2-3 weeks",
    "stack": ["Tech1", "Tech2"]
  }
]

Return ONLY valid JSON, no markdown or extra text.
`;

    const result = await model.generateContent(prompt);
    const response = result.response;
    const responseText = response.text();
    
    let cleanedText = responseText.trim();
    if (cleanedText.startsWith('\`\`\`json')) {
      cleanedText = cleanedText.replace(/^\`\`\`json\n/, '').replace(/\n\`\`\`$/, '');
    } else if (cleanedText.startsWith('\`\`\`')) {
      cleanedText = cleanedText.replace(/^\`\`\`\n/, '').replace(/\n\`\`\`$/, '');
    }

    const projects = JSON.parse(cleanedText);

    return NextResponse.json({ projects });
  } catch (error: any) {
    console.error('Error suggesting projects:', error);
    return NextResponse.json(
      { error: 'Failed to suggest projects', details: error.message },
      { status: 500 }
    );
  }
}
