import { SearchX } from 'lucide-react';
import { Link } from 'react-router';
import { EmptyState } from '@/components/app/states';
import { Button } from '@/components/ui/button';

export function NotFoundPage() {
  return (
    <EmptyState
      icon={SearchX}
      title="Page not found"
      description="The address doesn't match any page in this workspace."
      action={
        <Button asChild variant="secondary">
          <Link to="/">Go to overview</Link>
        </Button>
      }
    />
  );
}
