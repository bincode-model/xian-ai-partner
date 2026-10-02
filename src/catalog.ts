import data from './data/catalog.json';
import type { Domain, Skill, Workflow } from './types';
const asset = (path: string | null) => path ? `${import.meta.env.BASE_URL}${path.replace(/^\//, '')}` : null;
export const domains = (data.domains as Domain[]).map(domain => ({ ...domain, poster: asset(domain.poster), video: asset(domain.video) }));
export const skills = data.skills as Skill[];
export const workflows = data.workflows as Workflow[];
