
import { Milestone } from './types';

export const INITIAL_MILESTONES: Milestone[] = [
  {
    id: '1',
    title: 'Project Kickoff',
    description: 'Initial brainstorming and goal definition.',
    date: '2024-01-01',
    completed: true,
    type: 'internal',
    tags: ['start', 'planning']
  },
  {
    id: '2',
    title: 'MVP Design Phase',
    description: 'Creating high-fidelity wireframes and user flow diagrams.',
    date: '2024-01-15',
    completed: true,
    type: 'feature',
    tags: ['design', 'ui']
  },
  {
    id: '3',
    title: 'Frontend Architecture',
    description: 'Setting up React, TypeScript, and Tailwind environment.',
    date: '2024-02-01',
    completed: true,
    type: 'internal',
    tags: ['tech', 'setup']
  },
  {
    id: '4',
    title: 'Core API Integration',
    description: 'Connecting to backend services and authentication.',
    date: '2024-02-20',
    completed: true,
    type: 'feature',
    tags: ['api', 'backend']
  },
  {
    id: '5',
    title: 'Alpha Release',
    description: 'Internal testing with selected stakeholders.',
    date: '2024-03-10',
    completed: false,
    type: 'release',
    tags: ['testing', 'alpha']
  },
  {
    id: '6',
    title: 'Performance Optimization',
    description: 'Lighthouse scoring and asset minification.',
    date: '2024-04-05',
    completed: false,
    type: 'internal',
    tags: ['performance']
  },
  {
    id: '7',
    title: 'v1.0 Public Launch',
    description: 'Deploying to production and marketing rollout.',
    date: '2024-05-01',
    completed: false,
    type: 'release',
    tags: ['launch', 'prod']
  }
];

export const COLORS = {
  feature: 'bg-blue-500',
  release: 'bg-purple-500',
  fix: 'bg-red-500',
  internal: 'bg-gray-500',
  completed: 'bg-green-500'
};
