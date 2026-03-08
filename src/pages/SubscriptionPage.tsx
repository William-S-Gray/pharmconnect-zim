import { Button } from '@/components/ui/button';
import { Check, X } from 'lucide-react';

const plans = [
  {
    name: 'FREE',
    price: 0,
    features: ['Listed on PharmTrack', 'Searchable by patients', '100 drugs max'],
    missing: ['SMS Alerts', 'Analytics', 'API Access'],
    current: false,
  },
  {
    name: 'BASIC',
    price: 29,
    features: ['Everything in Free', 'SMS Stock Alerts', 'Search count analytics', '500 drugs max'],
    missing: ['Full analytics', 'API Access', 'Priority listing'],
    current: true,
    popular: true,
  },
  {
    name: 'PRO',
    price: 79,
    features: ['Everything in Basic', 'Full analytics dashboard', 'Unlimited drugs', 'API access', 'Priority listing'],
    missing: [],
    current: false,
  },
];

const SubscriptionPage = () => {
  return (
    <div className="space-y-6 animate-fade-in">
      <h1 className="font-heading font-bold text-2xl text-foreground">Subscription</h1>
      <p className="text-muted-foreground">Choose the plan that best fits your pharmacy</p>

      <div className="grid md:grid-cols-3 gap-4">
        {plans.map((plan) => (
          <div
            key={plan.name}
            className={`card-pharma relative ${plan.popular ? 'border-primary ring-1 ring-primary' : ''}`}
          >
            {plan.popular && (
              <span className="absolute -top-2.5 left-1/2 -translate-x-1/2 bg-primary text-primary-foreground text-[10px] font-bold px-3 py-0.5 rounded-full">
                POPULAR
              </span>
            )}
            <h3 className="font-heading font-bold text-lg text-foreground">{plan.name}</h3>
            <div className="mt-2 mb-4">
              <span className="font-heading font-bold text-3xl text-foreground">${plan.price}</span>
              <span className="text-muted-foreground text-sm">/month</span>
            </div>
            <ul className="space-y-2 mb-6 text-sm">
              {plan.features.map(f => (
                <li key={f} className="flex items-center gap-2 text-foreground">
                  <Check className="w-4 h-4 text-accent flex-shrink-0" /> {f}
                </li>
              ))}
              {plan.missing.map(f => (
                <li key={f} className="flex items-center gap-2 text-muted-foreground">
                  <X className="w-4 h-4 flex-shrink-0" /> {f}
                </li>
              ))}
            </ul>
            {plan.current ? (
              <Button variant="outline" className="w-full" disabled>Current Plan</Button>
            ) : (
              <Button className="w-full" variant={plan.price > 29 ? 'default' : 'outline'}>
                {plan.price === 0 ? 'Downgrade' : 'Upgrade'}
              </Button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};

export default SubscriptionPage;
