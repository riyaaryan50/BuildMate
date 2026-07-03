import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenerativeAI } from '@google/generative-ai';

const apiKey = process.env.NEXT_PUBLIC_GEMINI_API_KEY || process.env.GEMINI_API_KEY || '';

if (!apiKey) {
  console.warn('⚠️ GEMINI_API_KEY is not configured. AI features will be limited.');
}

const genAI = apiKey ? new GoogleGenerativeAI(apiKey) : null;

export async function POST(request: NextRequest) {
  try {
    const { text, uid } = await request.json();

    if (!text || !uid) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    if (!genAI) {
      console.error('❌ Gemini API not configured');
      return NextResponse.json(
        { 
          error: 'AI service not configured',
          details: 'Please add GEMINI_API_KEY to your environment variables'
        },
        { status: 503 }
      );
    }

    const model = genAI.getGenerativeModel({ model: 'gemini-flash-latest' });

    const prompt = `
You are a skills analyzer. Parse the following user description and extract structured information.

User description: "${text}"

Extract and return a JSON object with:
- skills: array of specific technical skills mentioned (e.g., ["HTML", "CSS", "JavaScript", "React"])
- preferredTech: array of technologies or frameworks mentioned (e.g., ["React", "Node.js", "Firebase"])
- experience: one of "beginner", "intermediate", or "advanced" based on the description
- timeBudget: estimated weekly hours as a string (e.g., "10 hours/week") or "flexible" if not specified

Return ONLY valid JSON, no markdown or extra text.
`;

    const result = await model.generateContent(prompt);
    const response = result.response;
    const responseText = response.text();
    
    // Clean up the response to extract JSON
    let cleanedText = responseText.trim();
    if (cleanedText.startsWith('\`\`\`json')) {
      cleanedText = cleanedText.replace(/^\`\`\`json\n/, '').replace(/\n\`\`\`$/, '');
    } else if (cleanedText.startsWith('\`\`\`')) {
      cleanedText = cleanedText.replace(/^\`\`\`\n/, '').replace(/\n\`\`\`$/, '');
    }

    const parsed = JSON.parse(cleanedText);

    return NextResponse.json(parsed);
  } catch (error: any) {
    console.error('Error parsing profile:', error);
    return NextResponse.json(
      { error: 'Failed to parse profile', details: error.message },
      { status: 500 }
    );
  }
}
