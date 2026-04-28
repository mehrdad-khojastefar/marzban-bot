import { Bird } from 'lucide-react';

export function EmptyState({
  title = 'No data',
  description = 'Nothing to show here yet.',
}: {
  title?: string;
  description?: string;
}) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <Bird className="mb-4 h-12 w-12 text-muted-foreground/40" />
      <h3 className="text-sm font-medium text-foreground">{title}</h3>
      <p className="mt-1 text-sm text-muted-foreground">{description}</p>
    </div>
  );
}
