import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenerativeAI } from '@google/generative-ai';

const genAI = new GoogleGenerativeAI(process.env.NEXT_PUBLIC_GEMINI_API_KEY || '');

export async function POST(request: NextRequest) {
  try {
    const { projectId, message, context, conversationHistory } = await request.json();

    if (!projectId || !message) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const model = genAI.getGenerativeModel({ 
      model: 'gemini-flash-latest',
      generationConfig: {
        temperature: 0.9,
        topK: 40,
        topP: 0.95,
        maxOutputTokens: 1024,
      },
    });

    // Build system instruction with project context
    const systemInstruction = `You are an AI mentor helping a developer build their project. You have full awareness of their progress and current state. Remember the conversation and provide contextual, helpful responses.

PROJECT CONTEXT:
- Title: ${context.projectTitle}
- Description: ${context.projectDescription || 'N/A'}
- Difficulty: ${context.difficulty}
- Overall Progress: ${context.progress?.progressPercent || 0}% complete (${context.progress?.completedTasks || 0}/${context.progress?.totalTasks || 0} tasks)

CURRENT STATUS:
${context.currentMilestone ? `
- Current Milestone: ${context.currentMilestone.title}
- Milestone Description: ${context.currentMilestone.description}
- Milestone Progress: ${context.currentMilestone.tasksCompleted}/${context.currentMilestone.tasksTotal} tasks completed
` : '- Starting the project'}

RECENTLY COMPLETED TASKS:
${context.recentCompletedTasks && context.recentCompletedTasks.length > 0 
  ? context.recentCompletedTasks.map((t: any) => `✅ ${t.milestone}: ${t.task}`).join('\n')
  : '- No tasks completed yet'}

CURRENT ACTIVE TASKS:
${context.currentActiveTasks && context.currentActiveTasks.length > 0
  ? context.currentActiveTasks.map((t: any) => `🎯 ${t.milestone}: ${t.task} - ${t.description}`).join('\n')
  : '- All current tasks completed!'}

INSTRUCTIONS:
- Remember the entire conversation history and build upon previous messages
- Reference what the user mentioned earlier in the conversation
- Provide specific, actionable advice based on their current milestone
- Be encouraging and conversational
- Keep responses concise (2-5 sentences) but contextual
- Use emojis appropriately 😊`;

    // Start a chat session with history
    const chat = model.startChat({
      history: conversationHistory && conversationHistory.length > 0 
        ? conversationHistory.map((msg: any) => ({
            role: msg.role,
            parts: [{ text: msg.text }],
          }))
        : [],
      generationConfig: {
        temperature: 0.9,
        topK: 40,
        topP: 0.95,
        maxOutputTokens: 1024,
      },
    });

    // Send the message with system context prepended only on first message
    const isFirstMessage = !conversationHistory || conversationHistory.length === 0;
    const fullMessage = isFirstMessage ? `${systemInstruction}\n\nUser: ${message}` : message;
    
    const result = await chat.sendMessage(fullMessage);
    const response = result.response;
    const responseText = response.text();

    // Validate response
    if (!responseText || responseText.trim().length === 0) {
      console.error('Empty response from Gemini API');
      return NextResponse.json({ 
        response: "I'm having trouble responding right now. Could you try rephrasing your question?" 
      });
    }

    return NextResponse.json({ response: responseText });
  } catch (error: any) {
    console.error('Error in chat API:', error);
    
    // Return a user-friendly error message
    const fallbackMessage = error.message?.includes('API key') 
      ? "I'm temporarily unavailable. Please check the API configuration."
      : "I encountered an error. Please try again in a moment.";
    
    return NextResponse.json(
      { error: 'Failed to get chat response', details: error.message, response: fallbackMessage },
      { status: 500 }
    );
  }
}
