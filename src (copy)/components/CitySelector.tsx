import { MapPin } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { useSearchStore } from '@/stores/searchStore';
import { toast } from 'sonner';

export function CitySelector() {
  const { city, setCity, setLocation } = useSearchStore();

  const handleUseLocation = () => {
    if (!navigator.geolocation) {
      toast.error('Geolocation is not supported by your browser');
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLocation(position.coords.latitude, position.coords.longitude);
        toast.success('Location detected');
      },
      () => {
        toast.error('Unable to get your location. Please select a city.');
      }
    );
  };

  return (
    <div className="flex items-center gap-3 justify-center flex-wrap">
      <Select value={city} onValueChange={setCity}>
        <SelectTrigger className="w-40 h-10 bg-card/80 border-0">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="Harare">Harare</SelectItem>
          <SelectItem value="Mutare">Mutare</SelectItem>
          <SelectItem value="Bulawayo">Bulawayo</SelectItem>
          <SelectItem value="Gweru">Gweru</SelectItem>
        </SelectContent>
      </Select>
      <Button variant="ghost" size="sm" onClick={handleUseLocation} className="text-primary-foreground/80 hover:text-primary-foreground hover:bg-primary-foreground/10">
        <MapPin className="w-4 h-4 mr-1" /> Use my location
      </Button>
    </div>
  );
}
