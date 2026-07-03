'use client';

import { useState } from 'react';
import type { ReactElement } from 'react';

interface MarkdownMessageProps {
  text: string;
  className?: string;
}

export function MarkdownMessage({ text, className = '' }: MarkdownMessageProps) {
  const [copiedCode, setCopiedCode] = useState<string | null>(null);

  const copyToClipboard = (code: string, id: string) => {
    navigator.clipboard.writeText(code);
    setCopiedCode(id);
    setTimeout(() => setCopiedCode(null), 2000);
  };

  // Format the markdown text to HTML
  const formatMessage = (message: string): ReactElement => {
    const parts: ReactElement[] = [];
    let remaining = message;
    let key = 0;

    // Process code blocks first
    const codeBlockRegex = /```(\w+)?\n([\s\S]*?)```/g;
    let lastIndex = 0;
    let match;

    while ((match = codeBlockRegex.exec(message)) !== null) {
      // Add text before code block
      if (match.index > lastIndex) {
        const textBefore = message.slice(lastIndex, match.index);
        parts.push(
          <span key={key++} dangerouslySetInnerHTML={{ __html: formatInlineMarkdown(textBefore) }} />
        );
      }

      // Add code block with copy button
      const lang = match[1] || 'plaintext';
      const code = match[2].trim();
      const codeId = `code-${key}`;
      
      parts.push(
        <div key={key++} className="relative group my-2">
          <div className="absolute top-2 right-2 z-10">
            <button
              onClick={() => copyToClipboard(code, codeId)}
              className="px-2 py-1 bg-gray-700 hover:bg-gray-600 text-white text-xs rounded transition-colors opacity-0 group-hover:opacity-100"
              title="Copy code"
            >
              {copiedCode === codeId ? (
                <span className="flex items-center space-x-1">
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  <span>Copied!</span>
                </span>
              ) : (
                <span className="flex items-center space-x-1">
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                  </svg>
                  <span>Copy</span>
                </span>
              )}
            </button>
          </div>
          <pre className="bg-gray-900 dark:bg-gray-950 text-gray-100 p-3 pt-8 rounded-lg overflow-x-auto text-xs font-mono">
            <code className={`language-${lang}`}>{code}</code>
          </pre>
        </div>
      );

      lastIndex = match.index + match[0].length;
    }

    // Add remaining text
    if (lastIndex < message.length) {
      const textAfter = message.slice(lastIndex);
      parts.push(
        <span key={key++} dangerouslySetInnerHTML={{ __html: formatInlineMarkdown(textAfter) }} />
      );
    }

    return <>{parts}</>;
  };

  const formatInlineMarkdown = (text: string): string => {
    let formatted = text;

    // Inline code with `
    formatted = formatted.replace(/`([^`]+)`/g, '<code class="bg-gray-200 dark:bg-gray-800 text-red-600 dark:text-red-400 px-1.5 py-0.5 rounded text-xs font-mono">$1</code>');

    // Bold text with ** or __ (must come before italic to avoid conflicts)
    formatted = formatted.replace(/\*\*(.+?)\*\*/g, '<strong class="font-bold">$1</strong>');
    formatted = formatted.replace(/__(.+?)__/g, '<strong class="font-bold">$1</strong>');

    // Italic text with * or _ (single only, not already matched by bold)
    formatted = formatted.replace(/(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)/g, '<em class="italic">$1</em>');
    formatted = formatted.replace(/(?<!_)_(?!_)(.+?)(?<!_)_(?!_)/g, '<em class="italic">$1</em>');

    // Headers
    formatted = formatted.replace(/^### (.+)$/gm, '<h3 class="font-bold text-base mt-3 mb-1">$1</h3>');
    formatted = formatted.replace(/^## (.+)$/gm, '<h2 class="font-bold text-lg mt-3 mb-1">$1</h2>');
    formatted = formatted.replace(/^# (.+)$/gm, '<h1 class="font-bold text-xl mt-3 mb-1">$1</h1>');

    // Bullet lists - handle multiple formats
    formatted = formatted.replace(/^[•] (.+)$/gm, '<li class="ml-4 mb-1 flex items-start"><span class="mr-2 text-primary-600 dark:text-primary-400">•</span><span>$1</span></li>');
    formatted = formatted.replace(/^[\-] (.+)$/gm, '<li class="ml-4 mb-1 flex items-start"><span class="mr-2 text-primary-600 dark:text-primary-400">•</span><span>$1</span></li>');
    formatted = formatted.replace(/^[\*] (.+)$/gm, '<li class="ml-4 mb-1 flex items-start"><span class="mr-2 text-primary-600 dark:text-primary-400">•</span><span>$1</span></li>');
    
    // Numbered lists
    formatted = formatted.replace(/^(\d+)\. (.+)$/gm, '<li class="ml-4 mb-1 flex items-start"><span class="mr-2 text-primary-600 dark:text-primary-400 font-semibold">$1.</span><span>$2</span></li>');

    // Links
    formatted = formatted.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer" class="text-blue-600 dark:text-blue-400 hover:underline">$1</a>');

    // Line breaks
    formatted = formatted.replace(/\n\n/g, '<br/><br/>');
    formatted = formatted.replace(/\n/g, '<br/>');

    return formatted;
  };

  return (
    <div className={`prose prose-sm dark:prose-invert max-w-none ${className}`}>
      {formatMessage(text)}
    </div>
  );
}
