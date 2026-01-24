
export interface Milestone {
  id: string;
  title: string;
  description: string;
  date: string;
  completed: boolean;
  type: 'feature' | 'release' | 'fix' | 'internal';
  tags: string[];
}

export interface Project {
  id: string;
  name: string;
  description: string;
  milestones: Milestone[];
}

export type Theme = 'dark' | 'light';
