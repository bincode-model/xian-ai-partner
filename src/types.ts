export type DomainId = 'drug' | 'industry' | 'ecommerce' | 'finance' | 'tourism' | 'employment' | 'government' | 'agriculture';
export type ViewId = 'overview' | 'industry' | 'coordination' | 'organization' | 'skills' | 'runs' | 'schedules' | 'connections';
export interface Domain { id: DomainId; name: string; shortName: string; description: string; outcome: string; icon: string; color: string; departments: string[]; video: string | null; poster: string | null; }
export interface Skill { id: string; name: string; domain_id: DomainId; department: string; role: string; pain_point: string; trigger: string; inputs: string | string[]; outputs: string | string[]; required_tools: string | string[]; review_boundary: string; acceptance: string; legacy_skill_ids: string[]; status: { defined: boolean; implemented: boolean; connected: boolean; validated: boolean }; }
export interface WorkflowStep { sequence: number; name: string; input_description: string; action_description: string; output_description: string; acceptance_description: string; task_ids: string[]; failure_code: string; handoff_role: string; failure_action: string; }
export interface Workflow { id: string; domain_id: DomainId; name: string; steps: WorkflowStep[]; }
export interface Artifact { id: string; run_id: string; name: string; mime: string; size: number; created_at: string; download_url: string; }
export interface Step { id: string; name: string; status: 'pending' | 'running' | 'completed' | 'failed' | 'skipped'; detail: string; started_at?: string | null; finished_at?: string | null; }
export type RunStatus = 'queued' | 'running' | 'awaiting_review' | 'completed' | 'needs_revision' | 'failed' | 'cancelled';
export interface Run { id: string; domain_id: DomainId; title: string; status: RunStatus; created_at: string; updated_at: string; started_at: string | null; finished_at: string | null; input_text: string; ai_enabled: boolean; parent_id?: string | null; error?: string | null; review_note?: string | null; steps: Step[]; artifacts: Artifact[]; summary?: string | null; issues: string[]; }
export interface Member { id: string; name: string; domain_id: DomainId; department: string; role: string; skill_ids: string[]; created_at: string; }
export interface Agent extends Member { enabled: boolean; }
export interface Schedule { id: string; name: string; domain_id: DomainId; input_text: string; interval_minutes: number; enabled: boolean; ai_enabled: boolean; next_run_at: string; last_run_at: string | null; last_run_id: string | null; created_at: string; }
export interface Upload { id: string; filename: string; size: number; created_at: string; }
export interface Metrics { total_runs: number; completed_runs: number; awaiting_review: number; failed_runs: number; artifacts_count: number; active_schedules: number; }
export interface Provider { type: 'codex_cli'; available: boolean; description: string; }
export type CaseStatus = 'open' | 'in_progress' | 'awaiting_input' | 'resolved';
export interface ServiceCase { id: string; title: string; domain_id: DomainId; requester: string; department: string; assignee_id: string | null; run_id: string | null; status: CaseStatus; description: string; created_at: string; updated_at: string; notes: {id:string; text:string; created_at:string}[]; }
export interface State { runs: Run[]; members: Member[]; agents: Agent[]; schedules: Schedule[]; uploads: Upload[]; cases: ServiceCase[]; metrics: Metrics; provider: Provider; }
export interface Sample { filename: string; text: string; description: string; }
