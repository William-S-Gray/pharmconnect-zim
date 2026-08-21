import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { LoadingSpinner } from '@/components/LoadingSpinner';
import { PaginationControls } from '@/components/PaginationControls';
import { usePagination } from '@/hooks/use-pagination';
import { ExportDropdown } from '@/components/ExportDropdown';
import { exportCSV, exportExcel } from '@/lib/adminExportUtils';
import { Search, CalendarIcon, X, Shield, UserCog, Database, LogIn, Trash2, Edit, Plus, Eye } from 'lucide-react';
import { format } from 'date-fns';
import { api } from '@/lib/api';

interface AuditEntry {
  id: string;
  timestamp: string;
  user_email: string;
  user_role: 'admin' | 'pharmacy';
  action: string;
  category: 'auth' | 'user_mgmt' | 'drug_mgmt' | 'stock' | 'settings' | 'system';
  target: string;
  detail: string;
  ip_address: string;
}

const categoryConfig: Record<string, { label: string; icon: typeof Shield; className: string }> = {
  auth: { label: 'Auth', icon: LogIn, className: 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20' },
  user_mgmt: { label: 'Users', icon: UserCog, className: 'bg-orange-500/10 text-orange-600 dark:text-orange-400 border-orange-500/20' },
  drug_mgmt: { label: 'Drugs', icon: Database, className: 'bg-green-500/10 text-green-600 dark:text-green-400 border-green-500/20' },
  stock: { label: 'Stock', icon: Edit, className: 'bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/20' },
  settings: { label: 'Settings', icon: Shield, className: 'bg-muted text-muted-foreground border-border' },
  system: { label: 'System', icon: Shield, className: 'bg-destructive/10 text-destructive border-destructive/20' },
};

const actionIcons: Record<string, typeof Shield> = {
  create: Plus,
  update: Edit,
  delete: Trash2,
  login: LogIn,
  logout: LogIn,
  view: Eye,
};

// Audit logs will be fetched directly from Supabase
const demoAuditLog: AuditEntry[] = [];

const AdminAuditLogPage = () => {
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [actionFilter, setActionFilter] = useState('all');
  const [dateFrom, setDateFrom] = useState<Date | undefined>();
  const [dateTo, setDateTo] = useState<Date | undefined>();

  const { data: auditLog, isLoading } = useQuery<AuditEntry[]>({
    queryKey: ['admin', 'audit-log', categoryFilter, actionFilter, dateFrom?.toISOString(), dateTo?.toISOString()],
    queryFn: async () => {
      // Filtering by action and date happens server-side. The date
      // filters this replaces sent `format(dateFrom, 'yyyy-MM-dd')` — a
      // bare date compared against a timestamptz column, which silently
      // shifted the boundary by the client's UTC offset.
      const { items } = await api.admin.audit({
        event_type: actionFilter !== 'all' ? actionFilter : undefined,
        limit: 100,
      });

      return items.map((log: any) => ({
        id: log.id,
        timestamp: log.created_at,
        // user_id is null for anonymous and system events; the previous
        // code called .slice() on it and threw.
        user_email: log.user_email || log.metadata?.email || 'System',
        user_role: log.metadata?.role || 'pharmacy',
        action: String(log.event_type).split('_')[0] || 'view',
        category: log.metadata?.category || 'system',
        target: log.metadata?.target || 'System',
        detail: log.metadata?.detail || `Performed ${log.event_type}`,
        ip_address: log.ip_address || 'Unknown',
      })) as AuditEntry[];
    },
    placeholderData: [],
  });

  const entries = auditLog || demoAuditLog;

  const filtered = entries.filter((e) => {
    if (search) {
      const q = search.toLowerCase();
      if (
        !e.user_email.toLowerCase().includes(q) &&
        !e.action.toLowerCase().includes(q) &&
        !e.target.toLowerCase().includes(q) &&
        !e.detail.toLowerCase().includes(q)
      ) return false;
    }
    if (dateFrom && new Date(e.timestamp) < dateFrom) return false;
    if (dateTo) {
      const end = new Date(dateTo);
      end.setHours(23, 59, 59, 999);
      if (new Date(e.timestamp) > end) return false;
    }
    return true;
  });

  const pagination = usePagination(filtered, { defaultPageSize: 15 });

  const hasFilters = search || categoryFilter !== 'all' || actionFilter !== 'all' || dateFrom || dateTo;

  const clearFilters = () => {
    setSearch('');
    setCategoryFilter('all');
    setActionFilter('all');
    setDateFrom(undefined);
    setDateTo(undefined);
  };

  const exportRows = filtered.map((e) => ({
    Timestamp: format(new Date(e.timestamp), 'yyyy-MM-dd HH:mm:ss'),
    User: e.user_email,
    Role: e.user_role,
    Action: e.action,
    Category: categoryConfig[e.category]?.label || e.category,
    Target: e.target,
    Detail: e.detail,
    IP: e.ip_address,
  }));

  const formatTime = (ts: string) => {
    const d = new Date(ts);
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    if (diffMs < 60000) return 'Just now';
    if (diffMs < 3600000) return `${Math.floor(diffMs / 60000)}m ago`;
    if (diffMs < 86400000) return `${Math.floor(diffMs / 3600000)}h ago`;
    return format(d, 'MMM d, HH:mm');
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="font-heading font-bold text-2xl text-foreground text-emboss">Activity Log</h1>
          <p className="text-muted-foreground text-sm">Complete audit trail of all system actions</p>
        </div>
        <ExportDropdown
          onCSV={() => exportCSV(exportRows, 'audit-log')}
          onExcel={() => exportExcel(exportRows, 'audit-log', 'Audit Log')}
        />
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-col md:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Search user, action, target..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>

            <Select value={categoryFilter} onValueChange={setCategoryFilter}>
              <SelectTrigger className="w-full md:w-[150px]">
                <SelectValue placeholder="Category" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Categories</SelectItem>
                <SelectItem value="auth">Auth</SelectItem>
                <SelectItem value="user_mgmt">Users</SelectItem>
                <SelectItem value="drug_mgmt">Drugs</SelectItem>
                <SelectItem value="stock">Stock</SelectItem>
                <SelectItem value="settings">Settings</SelectItem>
                <SelectItem value="system">System</SelectItem>
              </SelectContent>
            </Select>

            <Select value={actionFilter} onValueChange={setActionFilter}>
              <SelectTrigger className="w-full md:w-[130px]">
                <SelectValue placeholder="Action" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Actions</SelectItem>
                <SelectItem value="create">Create</SelectItem>
                <SelectItem value="update">Update</SelectItem>
                <SelectItem value="delete">Delete</SelectItem>
                <SelectItem value="login">Login</SelectItem>
                <SelectItem value="logout">Logout</SelectItem>
                <SelectItem value="view">View</SelectItem>
              </SelectContent>
            </Select>

            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" className="w-full md:w-auto gap-2">
                  <CalendarIcon className="w-4 h-4" />
                  {dateFrom ? format(dateFrom, 'MMM d') : 'From'}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar mode="single" selected={dateFrom} onSelect={setDateFrom} initialFocus />
              </PopoverContent>
            </Popover>

            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" className="w-full md:w-auto gap-2">
                  <CalendarIcon className="w-4 h-4" />
                  {dateTo ? format(dateTo, 'MMM d') : 'To'}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar mode="single" selected={dateTo} onSelect={setDateTo} initialFocus />
              </PopoverContent>
            </Popover>

            {hasFilters && (
              <Button variant="ghost" size="sm" onClick={clearFilters} className="gap-1">
                <X className="w-4 h-4" /> Clear
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Results */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg flex items-center justify-between">
            <span>Audit Entries</span>
            <span className="text-sm font-normal text-muted-foreground">{filtered.length} records</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="py-8"><LoadingSpinner label="Loading audit log..." /></div>
          ) : filtered.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">No audit entries found.</p>
          ) : (
            <>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[140px]">Time</TableHead>
                      <TableHead>User</TableHead>
                      <TableHead className="w-[100px]">Category</TableHead>
                      <TableHead className="w-[80px]">Action</TableHead>
                      <TableHead>Target</TableHead>
                      <TableHead className="hidden lg:table-cell">Detail</TableHead>
                      <TableHead className="hidden xl:table-cell w-[120px]">IP</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {pagination.paginatedItems.map((entry) => {
                      const cat = categoryConfig[entry.category] || categoryConfig.system;
                      const ActionIcon = actionIcons[entry.action] || Eye;
                      return (
                        <TableRow key={entry.id}>
                          <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                            {formatTime(entry.timestamp)}
                          </TableCell>
                          <TableCell>
                            <div className="flex flex-col">
                              <span className="text-sm font-medium text-foreground truncate max-w-[180px]">{entry.user_email}</span>
                              <Badge variant="outline" className="w-fit text-[10px] mt-0.5">
                                {entry.user_role}
                              </Badge>
                            </div>
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline" className={`text-[10px] ${cat.className}`}>
                              {cat.label}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-1.5">
                              <ActionIcon className="w-3.5 h-3.5 text-muted-foreground" />
                              <span className="text-sm capitalize">{entry.action}</span>
                            </div>
                          </TableCell>
                          <TableCell className="text-sm font-medium text-foreground max-w-[200px] truncate">
                            {entry.target}
                          </TableCell>
                          <TableCell className="hidden lg:table-cell text-sm text-muted-foreground max-w-[250px] truncate">
                            {entry.detail}
                          </TableCell>
                          <TableCell className="hidden xl:table-cell text-xs text-muted-foreground font-mono">
                            {entry.ip_address}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
              <div className="p-4 border-t border-border">
                <PaginationControls
                  page={pagination.page}
                  totalPages={pagination.totalPages}
                  canPrev={pagination.canPrev}
                  canNext={pagination.canNext}
                  onPrev={pagination.prevPage}
                  onNext={pagination.nextPage}
                  onPageChange={pagination.setPage}
                  startIndex={pagination.startIndex}
                  endIndex={pagination.endIndex}
                  totalItems={pagination.totalItems}
                  pageSize={pagination.pageSize}
                  onPageSizeChange={pagination.setPageSize}
                />
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default AdminAuditLogPage;
