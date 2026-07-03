import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenerativeAI } from '@google/generative-ai';

const genAI = new GoogleGenerativeAI(process.env.NEXT_PUBLIC_GEMINI_API_KEY || '');

export async function POST(request: NextRequest) {
  console.log('🚀 Starting project creation...');
  
  try {
    const { project, uid, profile } = await request.json();
    
    console.log('📦 Request data:', {
      hasProject: !!project,
      projectTitle: project?.title,
      hasUid: !!uid,
      hasProfile: !!profile
    });

    if (!project || !uid || !profile) {
      console.error('❌ Missing required fields:', { project: !!project, uid: !!uid, profile: !!profile });
      return NextResponse.json({ 
        error: 'Missing required fields',
        details: { project: !!project, uid: !!uid, profile: !!profile }
      }, { status: 400 });
    }

    // Check if API key exists
    if (!process.env.NEXT_PUBLIC_GEMINI_API_KEY) {
      console.error('❌ GEMINI_API_KEY is not set');
      return NextResponse.json({ 
        error: 'Server configuration error: AI service not configured',
        details: 'Missing GEMINI_API_KEY environment variable'
      }, { status: 500 });
    }
    
    console.log('✅ API key configured, creating model...');

    const model = genAI.getGenerativeModel({ model: 'gemini-flash-latest' });

    const prompt = `
You are a project planning AI. Generate a detailed roadmap for this project:

Project: ${project.title}
Description: ${project.description}
Difficulty: ${project.difficulty}

User profile:
- Skills: ${profile.skills?.join(', ') || 'general programming'}
- Experience: ${profile.experience || 'beginner'}

Create a roadmap with 4-6 milestones. Each milestone should have 3-5 tasks.

Return ONLY a JSON object with this exact structure:
{
  "milestones": [
    {
      "id": "m1",
      "title": "Milestone Title",
      "description": "What will be accomplished",
      "estimatedHours": 8,
      "tasks": [
        {
          "id": "t1",
          "title": "Task Title",
          "description": "Detailed task description",
          "estimatedHours": 2,
          "difficulty": "easy" | "medium" | "hard",
          "requiredSkills": ["Skill1", "Skill2"],
          "resources": [
            {
              "title": "Resource Title",
              "url": "https://example.com",
              "type": "article" | "video" | "documentation"
            }
          ],
          "done": false,
          "locked": true
        }
      ]
    }
  ]
}

Important:
- Make sure task IDs are sequential (t1, t2, t3...) across all milestones
- Set locked: false ONLY for the very first task (m1.t1)
- All other tasks should have locked: true
- Include real, helpful resource URLs
- Make tasks specific and actionable

Return ONLY valid JSON, no markdown.
`;

    console.log('🤖 Generating roadmap for project:', project.title);
    
    let result, response, responseText;
    try {
      result = await model.generateContent(prompt);
      response = result.response;
      responseText = response.text();
    } catch (aiError: any) {
      console.error('❌ AI generation error:', aiError);
      return NextResponse.json({ 
        error: 'AI service error',
        details: aiError.message || 'Failed to generate content',
        status: aiError.status || 500
      }, { status: aiError.status || 500 });
    }
    
    if (!responseText) {
      console.error('❌ AI returned empty response');
      return NextResponse.json({ 
        error: 'AI returned empty response',
        details: 'The AI model did not generate any content'
      }, { status: 500 });
    }
    
    console.log('✅ AI Response received, length:', responseText.length);
    
    let cleanedText = responseText.trim();
    if (cleanedText.startsWith('\`\`\`json')) {
      cleanedText = cleanedText.replace(/^\`\`\`json\n/, '').replace(/\n\`\`\`$/, '');
    } else if (cleanedText.startsWith('\`\`\`')) {
      cleanedText = cleanedText.replace(/^\`\`\`\n/, '').replace(/\n\`\`\`$/, '');
    }

    let roadmap;
    try {
      roadmap = JSON.parse(cleanedText);
    } catch (parseError: any) {
      console.error('❌ Failed to parse AI response:', parseError);
      console.error('📄 Raw response (first 500 chars):', responseText.substring(0, 500));
      return NextResponse.json({ 
        error: 'AI returned invalid JSON format',
        details: `Parse error: ${parseError.message}`,
        preview: responseText.substring(0, 200)
      }, { status: 500 });
    }

    // Validate roadmap structure
    if (!roadmap.milestones || !Array.isArray(roadmap.milestones) || roadmap.milestones.length === 0) {
      console.error('❌ Invalid roadmap structure:', { 
        hasMilestones: !!roadmap.milestones,
        isArray: Array.isArray(roadmap.milestones),
        length: roadmap.milestones?.length 
      });
      return NextResponse.json({ 
        error: 'Invalid roadmap structure',
        details: 'Missing or empty milestones array'
      }, { status: 500 });
    }

    // Unlock first task
    if (roadmap.milestones?.[0]?.tasks?.[0]) {
      roadmap.milestones[0].tasks[0].locked = false;
    } else {
      console.error('❌ Invalid roadmap structure: first milestone has no tasks');
      return NextResponse.json({ 
        error: 'Invalid roadmap structure',
        details: 'First milestone has no tasks',
        preview: JSON.stringify(roadmap.milestones?.[0] || {}).substring(0, 200)
      }, { status: 500 });
    }

    // Calculate total tasks
    let totalTasks = 0;
    roadmap.milestones?.forEach((m: any) => {
      totalTasks += m.tasks?.length || 0;
    });

    if (totalTasks === 0) {
      console.error('❌ Invalid roadmap: no tasks generated');
      return NextResponse.json({ 
        error: 'Invalid roadmap',
        details: 'No tasks generated across all milestones'
      }, { status: 500 });
    }

    console.log('Roadmap generated successfully:', totalTasks, 'tasks across', roadmap.milestones.length, 'milestones');

    // Auto-detect category based on project title and description
    const detectCategory = (title: string, description: string): string => {
      const text = `${title} ${description}`.toLowerCase();
      
      if (text.match(/\b(algorithm|data structure|leetcode|coding|dsa|competitive)\b/i)) return 'DSA';
      if (text.match(/\b(web|website|frontend|react|vue|angular|html|css|javascript)\b/i)) return 'Web Development';
      if (text.match(/\b(mobile|android|ios|flutter|react native|swift|kotlin)\b/i)) return 'Mobile Development';
      if (text.match(/\b(ai|ml|machine learning|deep learning|neural|model|tensorflow|pytorch)\b/i)) return 'AI/ML';
      if (text.match(/\b(devops|docker|kubernetes|ci\/cd|jenkins|deployment|infrastructure)\b/i)) return 'DevOps';
      if (text.match(/\b(database|sql|nosql|mongodb|postgresql|mysql|redis)\b/i)) return 'Database';
      if (text.match(/\b(game|unity|unreal|gaming|2d|3d)\b/i)) return 'Game Development';
      if (text.match(/\b(backend|server|api|node|express|django|flask|spring)\b/i)) return 'Backend';
      if (text.match(/\b(fullstack|full stack|mern|mean|lamp)\b/i)) return 'FullStack';
      if (text.match(/\b(data science|analytics|visualization|pandas|numpy)\b/i)) return 'Data Science';
      if (text.match(/\b(security|cyber|encryption|authentication|penetration)\b/i)) return 'Cybersecurity';
      if (text.match(/\b(blockchain|crypto|web3|ethereum|smart contract|solidity)\b/i)) return 'Blockchain';
      if (text.match(/\b(cloud|aws|azure|gcp|serverless)\b/i)) return 'Cloud';
      
      return 'General';
    };

    const category = detectCategory(project.title, project.description);

    // Return project data for client to save
    const projectData = {
      ownerId: uid,
      title: project.title,
      description: project.description,
      difficulty: project.difficulty,
      estimatedTime: project.estimatedTime,
      category: category,
      stack: project.stack || [],
      createdAt: new Date(),
      updatedAt: new Date(),
      status: 'active',
      roadmap: roadmap,
      progress: {
        completedTasks: 0,
        totalTasks: totalTasks,
        progressPercent: 0,
      },
    };

    return NextResponse.json({ 
      projectData,
      roadmap: roadmap
    });
  } catch (error: any) {
    console.error('Error creating project:', error);
    return NextResponse.json(
      { error: 'Failed to create project', details: error.message },
      { status: 500 }
    );
  }
}
