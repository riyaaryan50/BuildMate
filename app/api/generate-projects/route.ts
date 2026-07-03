import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenerativeAI } from '@google/generative-ai';

const genAI = new GoogleGenerativeAI(process.env.NEXT_PUBLIC_GEMINI_API_KEY || '');

export async function POST(request: NextRequest) {
  try {
    const { input, uid, profile } = await request.json();

    if (!input || !uid || !profile) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const model = genAI.getGenerativeModel({ model: 'gemini-flash-latest' });

    // Determine if input is a skill or project idea
    const analysisPrompt = `
Analyze this input: "${input}"

Is this primarily:
A) A skill/technology the user wants to learn (e.g., "React", "machine learning", "Node.js")
B) A project idea description (e.g., "a task manager", "weather app", "e-commerce site")

Answer with just "skill" or "project".
`;

    const analysisResult = await model.generateContent(analysisPrompt);
    const inputType = analysisResult.response.text().toLowerCase().includes('skill') ? 'skill' : 'project';

    let mainPrompt = '';
    
    if (inputType === 'skill') {
      mainPrompt = `
You are a project generator AI. The user wants to learn: "${input}"

User profile:
- Current Skills: ${profile.skills?.join(', ') || 'general programming'}
- Experience: ${profile.experience || 'beginner'}
- Time Budget: ${profile.timeBudget || 'flexible'}

Generate 3 project ideas that will help them learn "${input}". Each project should:
1. Focus on teaching ${input}
2. Match their experience level
3. Be progressively more complex

Return ONLY a JSON array:
[
  {
    "title": "Project Name",
    "description": "2-3 sentences describing the project and what they'll learn about ${input}",
    "difficulty": "beginner" | "intermediate" | "advanced",
    "estimatedTime": "e.g., 1-2 weeks"
  }
]

Return ONLY valid JSON, no markdown.
`;
    } else {
      mainPrompt = `
You are a project generator AI. The user wants to build: "${input}"

User profile:
- Current Skills: ${profile.skills?.join(', ') || 'general programming'}
- Experience: ${profile.experience || 'beginner'}
- Time Budget: ${profile.timeBudget || 'flexible'}

Generate 3 variations of this project at different complexity levels:
1. Beginner/Minimal version - core features only
2. Intermediate version - with additional features
3. Advanced/Production-ready version - with full features, optimization, and polish

Return ONLY a JSON array:
[
  {
    "title": "Project Name (Minimal/Feature-rich/Production-ready)",
    "description": "2-3 sentences describing this version and key features",
    "difficulty": "beginner" | "intermediate" | "advanced",
    "estimatedTime": "e.g., 1-2 weeks"
  }
]

Return ONLY valid JSON, no markdown.
`;
    }

    const result = await model.generateContent(mainPrompt);
    const response = result.response;
    const responseText = response.text();
    
    let cleanedText = responseText.trim();
    if (cleanedText.startsWith('\`\`\`json')) {
      cleanedText = cleanedText.replace(/^\`\`\`json\n/, '').replace(/\n\`\`\`$/, '');
    } else if (cleanedText.startsWith('\`\`\`')) {
      cleanedText = cleanedText.replace(/^\`\`\`\n/, '').replace(/\n\`\`\`$/, '');
    }

    const projects = JSON.parse(cleanedText);

    return NextResponse.json({ projects, type: inputType });
  } catch (error: any) {
    console.error('Error generating projects:', error);
    return NextResponse.json(
      { error: 'Failed to generate projects', details: error.message },
      { status: 500 }
    );
  }
}
