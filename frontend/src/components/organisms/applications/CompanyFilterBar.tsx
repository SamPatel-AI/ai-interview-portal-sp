import { Button } from '@/components/ui/button';

interface Props {
  companies: string[];
  selected: string;
  onSelect: (value: string) => void;
}

export default function CompanyFilterBar({ companies, selected, onSelect }: Props) {
  if (companies.length === 0) return null;
  return (
    <div className="flex items-center gap-2 flex-wrap">
      <Button variant={selected === 'all' ? 'default' : 'outline'} size="sm" onClick={() => onSelect('all')}>
        All
      </Button>
      {companies.map((company) => (
        <Button
          key={company}
          variant={selected === company ? 'default' : 'outline'}
          size="sm"
          onClick={() => onSelect(company)}
        >
          {company}
        </Button>
      ))}
    </div>
  );
}
