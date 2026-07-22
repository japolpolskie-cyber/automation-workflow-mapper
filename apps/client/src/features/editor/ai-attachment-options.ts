import type { AiAttachmentType } from '@awm/shared';

export interface AiAttachmentOption {
  id: string;
  type: AiAttachmentType;
  title: string;
  service: string;
  operation: string;
  summary: string;
}

export const aiAttachmentOptions: Record<AiAttachmentType, AiAttachmentOption[]> = {
  'chat-model': [
    ['openai', 'OpenAI Chat Model'], ['gemini', 'Google Gemini Chat Model'], ['anthropic', 'Anthropic Chat Model'],
    ['ollama', 'Ollama Chat Model'], ['groq', 'Groq Chat Model'], ['openrouter', 'OpenRouter Chat Model'],
  ].map(([id, title]) => ({ id: id!, type: 'chat-model', title: title!, service: title!.replace(' Chat Model', ''), operation: 'Chat Model', summary: 'Select the model and connection in n8n.' })),
  memory: [
    ['simple-memory', 'Simple Memory'], ['window-buffer-memory', 'Window Buffer Memory'], ['redis-chat-memory', 'Redis Chat Memory'],
    ['postgres-chat-memory', 'Postgres Chat Memory'], ['conversation-memory', 'Conversation Memory'],
  ].map(([id, title]) => ({ id: id!, type: 'memory', title: title!, service: 'n8n', operation: title!, summary: 'Configure conversation history metadata.' })),
  tool: [
    ['ai-agent-tool', 'AI Agent Tool'], ['call-workflow-tool', 'Call n8n Workflow Tool'], ['code-tool', 'Code Tool'],
    ['http-request-tool', 'HTTP Request Tool'], ['app-action-tool', 'Action in an App'], ['mcp-server', 'MCP Server'],
    ['vector-store-tool', 'Vector Store Tool'], ['human-review-tool', 'Human Review Tool'],
  ].map(([id, title]) => ({ id: id!, type: 'tool', title: title!, service: 'n8n', operation: title!, summary: 'Configure the tool operation and inputs in n8n.' })),
};

export const aiAttachmentLabel = (type: AiAttachmentType) => type === 'chat-model' ? 'Chat Model' : type === 'memory' ? 'Memory' : 'Tool';
