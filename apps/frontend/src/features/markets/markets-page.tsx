import type { MarketDTO } from '@codario/shared';
import { Ellipsis, Eye, Globe, Pencil, Plus, Sparkles, Trash2, TriangleAlert } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { toast } from 'sonner';
import { MarketAvatar } from '@/components/app/market-avatar';
import { PageHeader, Panel } from '@/components/app/panel';
import { EmptyState, ErrorState, TableSkeleton } from '@/components/app/states';
import { MarketStatusBadge } from '@/components/app/status-badge';
import { ConfirmDialog } from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Tooltip } from '@/components/ui/misc';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useDeleteMarket, useMarkets } from '@/features/api-hooks';
import { GenerateReportDialog } from '@/features/reports/generate-report-dialog';
import { errorMessage } from '@/lib/api';
import { displayRelative } from '@/lib/format';
import { PropertyLabel } from './property-label';

export function MarketsPage() {
  const markets = useMarkets();
  const navigate = useNavigate();
  const remove = useDeleteMarket();
  const [toDelete, setToDelete] = useState<MarketDTO | null>(null);
  const [generateFor, setGenerateFor] = useState<string | null>(null);

  return (
    <>
      <PageHeader
        title="Markets"
        description="Each market is a website with its Search Console property, brand colors and report template."
        actions={
          <Button asChild>
            <Link to="/markets/new">
              <Plus />
              New market
            </Link>
          </Button>
        }
      />

      <Panel>
        {markets.isPending ? (
          <TableSkeleton rows={4} columns={5} />
        ) : markets.isError ? (
          <ErrorState error={markets.error} onRetry={() => void markets.refetch()} />
        ) : markets.data.length === 0 ? (
          <EmptyState
            icon={Globe}
            title="No markets yet"
            description="Add a website, pick its Search Console property and give it its own logo and colors."
            action={
              <Button asChild>
                <Link to="/markets/new">
                  <Plus />
                  New market
                </Link>
              </Button>
            }
          />
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>Market</TableHead>
                <TableHead>Search Console property</TableHead>
                <TableHead>Template</TableHead>
                <TableHead>Last report</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-12">
                  <span className="sr-only">Actions</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {markets.data.map((market) => (
                <TableRow key={market.id} className="cursor-pointer" onClick={() => navigate(`/markets/${market.id}`)}>
                  <TableCell>
                    <span className="flex min-w-0 items-center gap-3">
                      <MarketAvatar name={market.name} color={market.primaryColor} logoUrl={market.logoUrl} />
                      <span className="grid min-w-0">
                        <Link
                          to={`/markets/${market.id}`}
                          className="truncate font-medium text-ink hover:underline"
                          onClick={(e) => e.stopPropagation()}
                        >
                          {market.name}
                        </Link>
                        <span className="truncate text-xs text-muted">{market.domain}</span>
                      </span>
                    </span>
                  </TableCell>
                  <TableCell>
                    {market.gscSiteUrl ? (
                      <span className="flex items-center gap-2">
                        <PropertyLabel siteUrl={market.gscSiteUrl} />
                        {!market.propertyLinked ? (
                          <Tooltip content="This property is not in the connected Google account's property list.">
                            <Badge variant="warning">
                              <TriangleAlert />
                              Not linked
                            </Badge>
                          </Tooltip>
                        ) : null}
                      </span>
                    ) : (
                      <span className="text-muted">Not assigned</span>
                    )}
                  </TableCell>
                  <TableCell className="text-ink-2">{market.template?.name ?? <span className="text-muted">Workspace default</span>}</TableCell>
                  <TableCell className="whitespace-nowrap text-ink-2">
                    {market.lastReportAt ? displayRelative(market.lastReportAt) : <span className="text-muted">Never</span>}
                    {market.reportsCount > 0 ? <span className="text-muted"> ({market.reportsCount})</span> : null}
                  </TableCell>
                  <TableCell>
                    <MarketStatusBadge status={market.status} />
                  </TableCell>
                  <TableCell onClick={(e) => e.stopPropagation()}>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon-sm" aria-label={`Actions for ${market.name}`}>
                          <Ellipsis />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent>
                        <DropdownMenuItem onSelect={() => navigate(`/markets/${market.id}`)}>
                          <Eye />
                          View performance
                        </DropdownMenuItem>
                        <DropdownMenuItem onSelect={() => setGenerateFor(market.id)} disabled={!market.gscSiteUrl}>
                          <Sparkles />
                          Generate report
                        </DropdownMenuItem>
                        <DropdownMenuItem onSelect={() => navigate(`/markets/${market.id}/edit`)}>
                          <Pencil />
                          Edit market
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem destructive onSelect={() => setToDelete(market)}>
                          <Trash2 />
                          Delete market
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
        title={`Delete ${toDelete?.name ?? 'market'}?`}
        description={`The market and its ${toDelete?.reportsCount ?? 0} report(s), including their PDFs, will be permanently deleted.`}
        confirmLabel="Delete market"
        pending={remove.isPending}
        onConfirm={() =>
          toDelete &&
          remove.mutate(toDelete.id, {
            onSuccess: () => {
              toast.success('Market deleted');
              setToDelete(null);
            },
            onError: (err) => toast.error(errorMessage(err)),
          })
        }
      />
      <GenerateReportDialog
        open={!!generateFor}
        onOpenChange={(open) => (!open ? setGenerateFor(null) : undefined)}
        defaultMarketId={generateFor}
        lockMarket
      />
    </>
  );
}
