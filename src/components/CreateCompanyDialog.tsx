import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@/lib/api';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { Loader2 } from 'lucide-react';

interface Props { open: boolean; onOpenChange: (o: boolean) => void }

export default function CreateCompanyDialog({ open, onOpenChange }: Props) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [logoUrl, setLogoUrl] = useState('');

  const mutation = useMutation({
    mutationFn: () => apiRequest('/api/companies', {
      method: 'POST',
      body: JSON.stringify({ name, description: description || undefined, logo_url: logoUrl || undefined }),
    }),
    onSuccess: () => {
      toast({ title: 'Company created' });
      queryClient.invalidateQueries({ queryKey: ['companies'] });
      onOpenChange(false);
      setName(''); setDescription(''); setLogoUrl('');
    },
    onError: (e: Error) => toast({ title: 'Failed', description: e.message, variant: 'destructive' }),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader><DialogTitle>Add Company</DialogTitle></DialogHeader>
        <form onSubmit={e => { e.preventDefault(); mutation.mutate(); }} className="space-y-4 mt-2">
          <div className="space-y-2"><Label>Company Name *</Label><Input value={name} onChange={e => setName(e.target.value)} required placeholder="Acme Corp" /></div>
          <div className="space-y-2"><Label>Description</Label><Textarea value={description} onChange={e => setDescription(e.target.value)} rows={3} placeholder="Brief description..." /></div>
          <div className="space-y-2"><Label>Logo URL</Label><Input value={logoUrl} onChange={e => setLogoUrl(e.target.value)} placeholder="https://..." /></div>
          <Button type="submit" className="w-full" disabled={!name || mutation.isPending}>
            {mutation.isPending && <Loader2 className="h-4 w-4 animate-spin mr-2" />}Create Company
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
