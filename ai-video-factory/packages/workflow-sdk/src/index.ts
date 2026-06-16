import {
  WorkflowState,
  WorkflowStatus,
  Platform,
  TrendItem,
  Transcript,
  AnalysisResult,
  Script,
  MediaAsset,
  TTSAudio,
  Subtitle,
  RenderOutput,
} from '@ai-video-factory/shared-types';
import { StateGraph, END, START } from '@langchain/langgraph';
import { Annotation } from '@langchain/langgraph';

/**
 * Workflow state annotation for LangGraph
 */
const WorkflowStateAnnotation = Annotation.Root({
  input: Annotation<{ url?: string; keyword?: string; platform?: Platform }>,
  status: Annotation<WorkflowStatus>,
  currentStep: Annotation<string>,
  error: Annotation<string | undefined>,
  trendResult: Annotation<TrendItem | undefined>,
  transcript: Annotation<Transcript | undefined>,
  analysis: Annotation<AnalysisResult | undefined>,
  script: Annotation<Script | undefined>,
  mediaAssets: Annotation<MediaAsset[] | undefined>,
  ttsAudio: Annotation<TTSAudio | undefined>,
  subtitle: Annotation<Subtitle | undefined>,
  renderOutput: Annotation<RenderOutput | undefined>,
});

type WorkflowGraphState = typeof WorkflowStateAnnotation.State;

/**
 * Agent implementations - these are injected via constructor
 */
export interface AgentHandlers {
  trendAgent: (state: WorkflowGraphState) => Promise<Partial<WorkflowGraphState>>;
  contentAgent: (state: WorkflowGraphState) => Promise<Partial<WorkflowGraphState>>;
  analysisAgent: (state: WorkflowGraphState) => Promise<Partial<WorkflowGraphState>>;
  scriptAgent: (state: WorkflowGraphState) => Promise<Partial<WorkflowGraphState>>;
  mediaAgent: (state: WorkflowGraphState) => Promise<Partial<WorkflowGraphState>>;
  voiceAgent: (state: WorkflowGraphState) => Promise<Partial<WorkflowGraphState>>;
  subtitleAgent: (state: WorkflowGraphState) => Promise<Partial<WorkflowGraphState>>;
  renderAgent: (state: WorkflowGraphState) => Promise<Partial<WorkflowGraphState>>;
}

/**
 * Create the LangGraph workflow
 */
export function createWorkflow(handlers: AgentHandlers) {
  const graph = new StateGraph(WorkflowStateAnnotation)
    .addNode('trend', async (state: WorkflowGraphState) => {
      try {
        const result = await handlers.trendAgent(state);
        return { ...result, currentStep: 'content', status: 'running' };
      } catch (e) {
        return { currentStep: 'trend', status: 'failed', error: String(e) };
      }
    })
    .addNode('content', async (state: WorkflowGraphState) => {
      try {
        const result = await handlers.contentAgent(state);
        return { ...result, currentStep: 'analysis', status: 'running' };
      } catch (e) {
        return { currentStep: 'content', status: 'failed', error: String(e) };
      }
    })
    .addNode('analysis', async (state: WorkflowGraphState) => {
      try {
        const result = await handlers.analysisAgent(state);
        return { ...result, currentStep: 'script', status: 'running' };
      } catch (e) {
        return { currentStep: 'analysis', status: 'failed', error: String(e) };
      }
    })
    .addNode('script', async (state: WorkflowGraphState) => {
      try {
        const result = await handlers.scriptAgent(state);
        return { ...result, currentStep: 'media', status: 'running' };
      } catch (e) {
        return { currentStep: 'script', status: 'failed', error: String(e) };
      }
    })
    .addNode('media', async (state: WorkflowGraphState) => {
      try {
        const result = await handlers.mediaAgent(state);
        return { ...result, currentStep: 'voice', status: 'running' };
      } catch (e) {
        return { currentStep: 'media', status: 'failed', error: String(e) };
      }
    })
    .addNode('voice', async (state: WorkflowGraphState) => {
      try {
        const result = await handlers.voiceAgent(state);
        return { ...result, currentStep: 'subtitle', status: 'running' };
      } catch (e) {
        return { currentStep: 'voice', status: 'failed', error: String(e) };
      }
    })
    .addNode('subtitle', async (state: WorkflowGraphState) => {
      try {
        const result = await handlers.subtitleAgent(state);
        return { ...result, currentStep: 'render', status: 'running' };
      } catch (e) {
        return { currentStep: 'subtitle', status: 'failed', error: String(e) };
      }
    })
    .addNode('render', async (state: WorkflowGraphState) => {
      try {
        const result = await handlers.renderAgent(state);
        return { ...result, currentStep: 'done', status: 'completed' };
      } catch (e) {
        return { currentStep: 'render', status: 'failed', error: String(e) };
      }
    })
    .addEdge(START, 'trend')
    .addEdge('trend', 'content')
    .addEdge('content', 'analysis')
    .addEdge('analysis', 'script')
    .addEdge('script', 'media')
    .addEdge('media', 'voice')
    .addEdge('voice', 'subtitle')
    .addEdge('subtitle', 'render')
    .addEdge('render', END);

  return graph.compile();
}

/**
 * Build a complete WorkflowState from initial input
 */
export function createInitialWorkflowState(
  input: { url?: string; keyword?: string; platform?: Platform },
): WorkflowGraphState {
  return {
    input,
    status: 'pending',
    currentStep: 'trend',
    error: undefined,
    trendResult: undefined,
    transcript: undefined,
    analysis: undefined,
    script: undefined,
    mediaAssets: undefined,
    ttsAudio: undefined,
    subtitle: undefined,
    renderOutput: undefined,
  };
}
