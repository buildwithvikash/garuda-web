import { Badge } from '@/components/ui/badge.jsx';

export const ActiveBadge = ({ active }) => <Badge variant={active ? 'success' : 'neutral'}>{active ? 'Active' : 'Inactive'}</Badge>;
