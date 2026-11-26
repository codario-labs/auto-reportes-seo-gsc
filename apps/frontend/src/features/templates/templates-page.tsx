import type { TemplateDTO } from '@codario/shared';
import { Copy, Ellipsis, Palette, Pencil, Plus, Star, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { toast } from 'sonner';
import { PageHeader, Panel } from '@/components/app/panel';
import { EmptyState, ErrorState, TableSkeleton } from '@/components/app/states';
import { ConfirmDialog } from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useDeleteTemplate, useDuplicateTemplate, useTemplates, useUpdateTemplate } from '@/features/api-hooks';
import { ApiError, errorMessage } from '@/lib/api';
import { displayRelative } from '@/lib/format';

function Swatches({ template }: { template: TemplateDTO }) {
  const { colors } = template.config;
  return (
    <span className="flex items-center" aria-hidden>
      {[colors.primary, colors.secondary, colors.text, colors.background].map((color, i) => (
        <span key={i} className="-ml-1 size-4 rounded-full border-2 border-surface first:ml-0" style={{ backgroundColor: color }} />
      ))}
    </span>
  );
}

export function TemplatesPage() {
  const templates = useTemplates();
  const navigate = useNavigate();
  const duplicate = useDuplicateTemplate();
  const update = useUpdateTemplate();
  const remove = useDeleteTemplate();
  const [toDelete, setToDelete] = useState<TemplateDTO | null>(null);

  return (
    <>
      <PageHeader
        title="Templates"
        description="Templates control how the PDF looks: colors, typography, sections and charts."
        actions={
          <Button asChild>
            <Link to="/templates/new">
              <Plus />
              New template
            </Link>
          </Button>
        }
      />
      <Panel>
        {templates.isPending ? (
          <TableSkeleton rows={3} columns={4} />
        ) : templates.isError ? (
          <ErrorState error={templates.error} onRetry={() => void templates.refetch()} />
        ) : templates.data.length === 0 ? (
          <EmptyState
            icon={Palette}
            title="No templates"
            description="Create a template to control the look of your reports."
            action={
              <Button asChild>
                <Link to="/templates/new">New template</Link>
              </Button>
            }
          />
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>Template</TableHead>
                <TableHead>Colors</TableHead>
                <TableHead>Used by</TableHead>
                <TableHead>Updated</TableHead>
                <TableHead className="w-12">
                  <span className="sr-only">Actions</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {templates.data.map((template) => (
                <TableRow key={template.id} className="cursor-pointer" onClick={() => navigate(`/templates/${template.id}`)}>
                  <TableCell>
                    <span className="grid min-w-0 gap-0.5">
                      <span className="flex flex-wrap items-center gap-2">
                        <Link
                          to={`/templates/${template.id}`}
                          className="font-medium text-ink hover:underline"
                          onClick={(e) => e.stopPropagation()}
                        >
                          {template.name}
                        </Link>
                        {template.isDefault ? <Badge variant="ink">Default</Badge> : null}
                        {template.isSystem ? <Badge variant="outline">System</Badge> : null}
                      </span>
                      {template.description ? <span className="max-w-md truncate text-xs text-muted">{template.description}</span> : null}
                    </span>
                  </TableCell>
                  <TableCell>
                    <Swatches template={template} />
                  </TableCell>
                  <TableCell className="text-ink-2">
                    {template.marketsCount === 0 ? <span className="text-muted">No markets</span> : `${template.marketsCount} market${template.marketsCount === 1 ? '' : 's'}`}
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-ink-2">{displayRelative(template.updatedAt)}</TableCell>
                  <TableCell onClick={(e) => e.stopPropagation()}>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon-sm" aria-label={`Actions for ${template.name}`}>
                          <Ellipsis />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent>
                        <DropdownMenuItem onSelect={() => navigate(`/templates/${template.id}`)}>
                          <Pencil />
                          Edit template
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onSelect={() =>
                            duplicate.mutate(template.id, {
                              onSuccess: (copy) => {
                                toast.success('Template duplicated');
                                navigate(`/templates/${copy.id}`);
                              },
                              onError: (err) => toast.error(errorMessage(err)),
                            })
                          }
                        >
                          <Copy />
                          Duplicate
                        </DropdownMenuItem>
                        {!template.isDefault ? (
                          <DropdownMenuItem
                            onSelect={() =>
                              update.mutate(
                                { id: template.id, input: { isDefault: true } },
                                {
                                  onSuccess: () => toast.success(`${template.name} is now the default template`),
                                  onError: (err) => toast.error(errorMessage(err)),
                                },
                              )
                            }
                          >
                            <Star />
                            Set as default
                          </DropdownMenuItem>
                        ) : null}
                        <DropdownMenuSeparator />
                        <DropdownMenuItem destructive disabled={template.isSystem} onSelect={() => setToDelete(template)}>
                          <Trash2 />
                          {template.isSystem ? 'System template' : 'Delete template'}
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Panel>

      <ConfirmDialog
        open={!!toDelete}
        onOpenChange={(open) => (!open ? setToDelete(null) : undefined)}
        title={`Delete ${toDelete?.name ?? 'template'}?`}
        description={
          toDelete?.marketsCount
            ? `${toDelete.marketsCount} market(s) use this template and will switch to the workspace default. Existing reports keep their PDFs.`
            : 'Existing reports keep their PDFs.'
        }
        confirmLabel="Delete template"
        pending={remove.isPending}
        onConfirm={() =>
          toDelete &&
          remove.mutate(toDelete.id, {
            onSuccess: () => {
              toast.success('Template deleted');
              setToDelete(null);
            },
            onError: (err) => {
              toast.error(err instanceof ApiError && err.status === 409 ? err.message : errorMessage(err));
              setToDelete(null);
            },
          })
        }
      />
    </>
  );
}
