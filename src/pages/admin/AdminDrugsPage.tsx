import { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Search, Plus, Pencil, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/api';
import { LoadingSpinner } from '@/components/LoadingSpinner';

interface Drug {
  id: string;
  name: string;
  generic_name: string;
  category: string;
  dosage_form: string;
  strength: string;
}

const categories = ['Analgesic', 'Antibiotic', 'Antidiabetic', 'Antihypertensive', 'Antifungal', 'Antihistamine', 'GI', 'Cardiovascular', 'Other'];
const dosageForms = ['Tablet', 'Capsule', 'Syrup', 'Injection', 'Cream', 'Ointment', 'Drops', 'Suspension'];

type DrugForm = Omit<Drug, 'id'>;
const emptyDrug: DrugForm = { name: '', generic_name: '', category: '', dosage_form: '', strength: '' };

const AdminDrugsPage = () => {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [catFilter, setCatFilter] = useState('ALL');
  const [showEditor, setShowEditor] = useState(false);
  const [editingDrug, setEditingDrug] = useState<Drug | null>(null);
  const [form, setForm] = useState<DrugForm>(emptyDrug);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<string | null>(null);

  const { data: drugs = [], isLoading } = useQuery<Drug[]>({
    queryKey: ['admin', 'drugs', catFilter],
    queryFn: async () => {
      const params: Record<string, string> = {};
      if (catFilter !== 'ALL') params.category = catFilter;
      const res = await api.get('/api/admin/drugs', { params });
      return res.data;
    },
  });

  const saveMutation = useMutation({
    mutationFn: async (data: { id?: string; drug: DrugForm }) => {
      if (data.id) {
        return api.put(`/api/admin/drugs/${data.id}`, data.drug);
      }
      return api.post('/api/admin/drugs', data.drug);
    },
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'drugs'] });
      queryClient.invalidateQueries({ queryKey: ['admin', 'stats'] });
      toast.success(vars.id ? 'Drug updated' : 'Drug added to database');
      setShowEditor(false);
    },
    onError: () => toast.error('Failed to save drug'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/api/admin/drugs/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'drugs'] });
      queryClient.invalidateQueries({ queryKey: ['admin', 'stats'] });
      toast.success('Drug removed from database');
      setShowDeleteConfirm(null);
    },
    onError: () => toast.error('Failed to delete drug'),
  });

  const openAdd = () => { setEditingDrug(null); setForm(emptyDrug); setShowEditor(true); };
  const openEdit = (drug: Drug) => {
    setEditingDrug(drug);
    setForm({ name: drug.name, generic_name: drug.generic_name, category: drug.category, dosage_form: drug.dosage_form, strength: drug.strength });
    setShowEditor(true);
  };

  const handleSave = () => {
    if (!form.name || !form.generic_name || !form.category || !form.dosage_form) {
      toast.error('Please fill all required fields'); return;
    }
    saveMutation.mutate({ id: editingDrug?.id, drug: form });
  };

  const filtered = drugs.filter(d => {
    return !search || d.name.toLowerCase().includes(search.toLowerCase()) || d.generic_name.toLowerCase().includes(search.toLowerCase());
  });

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="font-heading font-bold text-2xl text-foreground text-emboss">Drug Database</h1>
          <p className="text-muted-foreground text-sm">{drugs.length} drugs in master database</p>
        </div>
        <Button onClick={openAdd} className="gap-2"><Plus className="w-4 h-4" /> Add Drug</Button>
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input placeholder="Search drugs..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
        </div>
        <Select value={catFilter} onValueChange={setCatFilter}>
          <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All Categories</SelectItem>
            {categories.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <div className="py-8"><LoadingSpinner size="lg" label="Loading drugs..." /></div>
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border">
                    <th className="text-left p-3 font-medium text-muted-foreground">Brand Name</th>
                    <th className="text-left p-3 font-medium text-muted-foreground">Generic Name</th>
                    <th className="text-left p-3 font-medium text-muted-foreground hidden sm:table-cell">Category</th>
                    <th className="text-left p-3 font-medium text-muted-foreground hidden md:table-cell">Form</th>
                    <th className="text-left p-3 font-medium text-muted-foreground hidden md:table-cell">Strength</th>
                    <th className="text-right p-3 font-medium text-muted-foreground">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((d) => (
                    <tr key={d.id} className="border-b border-border last:border-0 hover:bg-muted/30 transition-colors">
                      <td className="p-3 font-medium text-foreground">{d.name}</td>
                      <td className="p-3 text-muted-foreground">{d.generic_name}</td>
                      <td className="p-3 hidden sm:table-cell"><Badge variant="outline" className="text-xs">{d.category}</Badge></td>
                      <td className="p-3 text-muted-foreground hidden md:table-cell">{d.dosage_form}</td>
                      <td className="p-3 text-muted-foreground hidden md:table-cell">{d.strength}</td>
                      <td className="p-3 text-right">
                        <div className="flex justify-end gap-1">
                          <Button size="icon" variant="ghost" onClick={() => openEdit(d)}><Pencil className="w-3.5 h-3.5" /></Button>
                          <Button size="icon" variant="ghost" className="text-destructive" onClick={() => setShowDeleteConfirm(d.id)}><Trash2 className="w-3.5 h-3.5" /></Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {filtered.length === 0 && <p className="p-8 text-center text-muted-foreground">No drugs found.</p>}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Add/Edit Dialog */}
      <Dialog open={showEditor} onOpenChange={setShowEditor}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editingDrug ? 'Edit Drug' : 'Add New Drug'}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2"><Label>Brand Name *</Label><Input value={form.name} onChange={(e) => setForm(f => ({ ...f, name: e.target.value }))} /></div>
              <div className="space-y-2"><Label>Generic Name *</Label><Input value={form.generic_name} onChange={(e) => setForm(f => ({ ...f, generic_name: e.target.value }))} /></div>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-2">
                <Label>Category *</Label>
                <Select value={form.category} onValueChange={(v) => setForm(f => ({ ...f, category: v }))}>
                  <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                  <SelectContent>{categories.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Form *</Label>
                <Select value={form.dosage_form} onValueChange={(v) => setForm(f => ({ ...f, dosage_form: v }))}>
                  <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                  <SelectContent>{dosageForms.map(f => <SelectItem key={f} value={f}>{f}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-2"><Label>Strength</Label><Input value={form.strength} onChange={(e) => setForm(f => ({ ...f, strength: e.target.value }))} placeholder="e.g. 500mg" /></div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowEditor(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={saveMutation.isPending}>{saveMutation.isPending ? 'Saving...' : editingDrug ? 'Update' : 'Add Drug'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <Dialog open={!!showDeleteConfirm} onOpenChange={() => setShowDeleteConfirm(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Delete Drug</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">Are you sure? This will remove the drug from the master database. Pharmacies with this drug in their stock will be affected.</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDeleteConfirm(null)}>Cancel</Button>
            <Button variant="destructive" disabled={deleteMutation.isPending} onClick={() => showDeleteConfirm && deleteMutation.mutate(showDeleteConfirm)}>
              {deleteMutation.isPending ? 'Deleting...' : 'Delete'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default AdminDrugsPage;
