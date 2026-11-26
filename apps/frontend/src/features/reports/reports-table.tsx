import { PERIOD_PRESET_LABELS, type ReportDTO } from '@codario/shared';
import { Download, Ellipsis, Eye, Trash2 } from 'lucide-react';
import { Link, useNavigate } from 'react-router';
import { MarketAvatar } from '@/components/app/market-avatar';
import { ReportStatusBadge } from '@/components/app/status-badge';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Tooltip } from '@/components/ui/misc';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { displayDateTime, displayRange, displayRelative } from '@/lib/format';

interface ReportsTableProps {
  reports: ReportDTO[];
  showMarket?: boolean;
  onDelete?: (report: ReportDTO) => void;
}

export function ReportsTable({ reports, showMarket = true, onDelete }: ReportsTableProps) {
  const navigate = useNavigate();
  return (
    <Table>
      <TableHeader>
        <TableRow className="hover:bg-transparent">
          {showMarket ? <TableHead>Market</TableHead> : null}
          <TableHead>Period</TableHead>
          <TableHead>Template</TableHead>
          <TableHead>Status</TableHead>
          <TableHead>Requested</TableHead>
          <TableHead className="w-24 text-right">
            <span className="sr-only">Actions</span>
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {reports.map((report) => (
          <TableRow key={report.id} className="cursor-pointer" onClick={() => navigate(`/reports/${report.id}`)}>
            {showMarket ? (
              <TableCell>
                <span className="flex min-w-0 items-center gap-2.5">
                  <MarketAvatar name={report.market.name} color={report.market.primaryColor} logoUrl={report.market.logoUrl} size="sm" />
                  <span className="grid min-w-0">
                    <Link
                      to={`/reports/${report.id}`}
                      className="truncate font-medium text-ink hover:underline"
                      onClick={(event) => event.stopPropagation()}
                    >
                      {report.market.name}
                    </Link>
                    <span className="truncate text-xs text-muted">{report.market.domain}</span>
                  </span>
                </span>
              </TableCell>
            ) : null}
            <TableCell>
              <span className="grid">
                {showMarket ? (
                  <span className="whitespace-nowrap text-ink">{displayRange(report.startDate, report.endDate)}</span>
                ) : (
                  <Link
                    to={`/reports/${report.id}`}
                    className="whitespace-nowrap font-medium text-ink hover:underline"
                    onClick={(event) => event.stopPropagation()}
                  >
                    {displayRange(report.startDate, report.endDate)}
                  </Link>
                )}
                <span className="whitespace-nowrap text-xs text-muted">{PERIOD_PRESET_LABELS[report.periodPreset]}</span>
              </span>
            </TableCell>
            <TableCell className="text-ink-2">{report.template?.name ?? <span className="text-muted">Deleted template</span>}</TableCell>
            <TableCell>
              <ReportStatusBadge status={report.status} />
            </TableCell>
            <TableCell>
              <Tooltip content={displayDateTime(report.requestedAt)}>
                <span className="whitespace-nowrap text-ink-2">{displayRelative(report.requestedAt)}</span>
              </Tooltip>
            </TableCell>
            <TableCell className="text-right" onClick={(event) => event.stopPropagation()}>
              <span className="inline-flex items-center gap-1">
                {report.status === 'COMPLETED' && report.downloadUrl ? (
                  <Button asChild variant="ghost" size="icon-sm">
                    <a href={report.downloadUrl} download={report.fileName ?? undefined} aria-label={`Download PDF for ${report.market.name}`}>
                      <Download />
                    </a>
                  </Button>
                ) : null}
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon-sm" aria-label="Report actions">
                      <Ellipsis />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent>
                    <DropdownMenuItem onSelect={() => navigate(`/reports/${report.id}`)}>
                      <Eye />
                      View report
                    </DropdownMenuItem>
                    {report.status === 'COMPLETED' && report.downloadUrl ? (
                      <DropdownMenuItem asChild>
                        <a href={report.downloadUrl} download={report.fileName ?? undefined}>
                          <Download />
                          Download PDF
                        </a>
                      </DropdownMenuItem>
                    ) : null}
                    {onDelete ? (
                      <>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem destructive onSelect={() => onDelete(report)}>
                          <Trash2 />
                          Delete report
                        </DropdownMenuItem>
                      </>
                    ) : null}
                  </DropdownMenuContent>
                </DropdownMenu>
              </span>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
