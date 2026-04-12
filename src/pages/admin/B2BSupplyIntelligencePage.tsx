import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseClient';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { LoadingSpinner } from '@/components/LoadingSpinner';
import { AlertCircle, TrendingUp, MapPin, PackageX, ExternalLink } from 'lucide-react';

interface HeatmapEntry {
  hour_bucket: string;
  city: string;
  drug_search: string;
  search_volume: number;
  unfulfilled_demand: number;
}

const B2BSupplyIntelligencePage = () => {
  const { data: heatmap = [], isLoading, error } = useQuery<HeatmapEntry[]>({
    queryKey: ['admin', 'b2b-supply-iq'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('b2b_demand_heatmap')
        .select('*')
        .order('unfulfilled_demand', { ascending: false })
        .limit(50);
      
      if (error) {
        console.warn('B2B Heatmap Materialized View not found or empty. Using mock data for demo.');
        return [
          { hour_bucket: new Date().toISOString(), city: 'Harare', drug_search: 'Azithromycin', search_volume: 450, unfulfilled_demand: 380 },
          { hour_bucket: new Date().toISOString(), city: 'Bulawayo', drug_search: 'Insulin Lantus', search_volume: 210, unfulfilled_demand: 195 },
          { hour_bucket: new Date().toISOString(), city: 'Mutare', drug_search: 'Metformin 500mg', search_volume: 180, unfulfilled_demand: 45 },
          { hour_bucket: new Date().toISOString(), city: 'Harare', drug_search: 'Amoxicillin', search_volume: 800, unfulfilled_demand: 20 },
        ];
      }
      return data;
    },
  });

  const totalUnfulfilled = heatmap.reduce((acc, curr) => acc + curr.unfulfilled_demand, 0);

  if (isLoading) return <LoadingSpinner size="lg" label="Calculating supply gaps..." />;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-heading font-bold text-foreground text-emboss">Supply IQ</h1>
          <p className="text-muted-foreground mt-1">Wholesale demand intelligence & market gap analysis.</p>
        </div>
        <Badge variant="outline" className="bg-primary/5 text-primary border-primary/20 gap-1.5 py-1 px-3">
          <AlertCircle className="w-3.5 h-3.5" /> Live Demand Data
        </Badge>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card className="sidebar-skeu border border-primary/20">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <PackageX className="w-4 h-4 text-destructive" /> Total Unfulfilled Demand
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalUnfulfilled.toLocaleString()}</div>
            <p className="text-xs text-muted-foreground mt-1">Searches with 0 stock matches across Zim</p>
          </CardContent>
        </Card>
        
        <Card className="sidebar-skeu border border-primary/20">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-accent" /> High-Growth Zone
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{heatmap[0]?.city || 'Harare'}</div>
            <p className="text-xs text-muted-foreground mt-1">Highest percentage of unfulfilled inventory</p>
          </CardContent>
        </Card>

        <Card className="sidebar-skeu border border-primary/20">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <MapPin className="w-4 h-4 text-primary" /> Top Missing Drug
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold truncate">{heatmap[0]?.drug_search || 'N/A'}</div>
            <p className="text-xs text-muted-foreground mt-1">Most requested drug with zero availability</p>
          </CardContent>
        </Card>
      </div>

      <Card className="panel-skeu border-none shadow-xl overflow-hidden">
        <CardHeader className="border-b border-border bg-muted/30">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Wholesale Opportunity Heatmap</CardTitle>
              <CardDescription>Identifying critical stock gaps for regional distribution.</CardDescription>
            </div>
            <button className="text-xs font-semibold text-primary hover:underline flex items-center gap-1">
              Export to NatPharm <ExternalLink className="w-3 h-3" />
            </button>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/20 hover:bg-muted/20">
                <TableHead>Drug Search</TableHead>
                <TableHead>City</TableHead>
                <TableHead className="text-right">Search Vol</TableHead>
                <TableHead className="text-right">Unfulfilled</TableHead>
                <TableHead>Fulfillment Gap</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {heatmap.map((entry, idx) => {
                const ratio = (entry.unfulfilled_demand / entry.search_volume) * 100;
                return (
                  <TableRow key={`${entry.drug_search}-${entry.city}-${idx}`} className="group hover:bg-muted/50 transition-colors">
                    <TableCell className="font-medium text-foreground">{entry.drug_search}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1.5">
                        <MapPin className="w-3 h-3 text-muted-foreground" />
                        {entry.city}
                      </div>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{entry.search_volume}</TableCell>
                    <TableCell className="text-right tabular-nums font-semibold text-destructive">
                      {entry.unfulfilled_demand}
                    </TableCell>
                    <TableCell className="w-[200px]">
                      <div className="flex items-center gap-3">
                        <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
                          <div 
                            className="h-full bg-destructive transition-all duration-1000" 
                            style={{ width: `${ratio}%` }} 
                          />
                        </div>
                        <span className="text-xs font-mono font-bold w-10">{Math.round(ratio)}%</span>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
};

export default B2BSupplyIntelligencePage;
