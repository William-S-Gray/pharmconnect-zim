import { Button } from '@/components/ui/button';
import { Check, X, Star } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import { useState } from 'react';

const plans = [
  {
    name: 'FREE' as const,
    price: 0,
    features: ['Listed on PharmConnect Zim', 'Searchable by patients', '100 drugs max'],
    missing: ['SMS Alerts', 'Analytics', 'API Access'],
    popular: false,
  },
  {
    name: 'BASIC' as const,
    price: 29,
    features: ['Everything in Free', 'SMS Stock Alerts', 'Search count analytics', '500 drugs max'],
    missing: ['Full analytics', 'API Access', 'Priority listing'],
    popular: true,
  },
  {
    name: 'PRO' as const,
    price: 79,
    features: ['Everything in Basic', 'Full analytics dashboard', 'Unlimited drugs', 'API access', 'Priority listing'],
    missing: [],
    popular: false,
  },
];

const SubscriptionPage = () => {
  const { pharmacy } = useAuth();
  const currentPlan = pharmacy?.plan_tier || 'FREE';
  const [loadingPlan, setLoadingPlan] = useState<string | null>(null);

  const handlePlanAction = async (plan: 'FREE' | 'BASIC' | 'PRO') => {
    if (plan === currentPlan) return;
    try {
      if (!pharmacy?.id) return;
      setLoadingPlan(plan);
      
      // Plan changes are super-admin only and audited. Previously any
      // pharmacy admin could write plan_tier directly, so upgrading to PRO
      // was a table update the browser could make for itself.
      await api.admin.setPharmacyPlan(pharmacy.id, plan);

      toast.success(`Successfully switched to ${plan} plan`);
    } catch (error: any) {
      toast.error(error.message || 'Failed to process subscription');
    } finally {
      setLoadingPlan(null);
    }
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <h1 className="font-heading font-bold text-2xl text-foreground text-emboss">Subscription</h1>
      <p className="text-muted-foreground">Choose the plan that best fits your pharmacy</p>

      <div className="grid md:grid-cols-3 gap-5">
        {plans.map((plan) => {
          const isCurrent = plan.name === currentPlan;
          return (
            <div
              key={plan.name}
              className={`card-pharma relative overflow-hidden ${plan.popular ? 'border-primary shadow-lg ring-1 ring-primary/20' : ''}`}
            >
              {plan.popular && (
                <span className="absolute -top-0 left-1/2 -translate-x-1/2 text-[10px] font-bold px-4 py-1 rounded-b-lg flex items-center gap-1 popular-badge-skeu">
                  <Star className="w-3 h-3" /> POPULAR
                </span>
              )}
              <h3 className="font-heading font-bold text-lg text-foreground mt-3 text-emboss">{plan.name}</h3>
              <div className="mt-2 mb-4">
                <span className="font-heading font-bold text-3xl text-foreground text-emboss">${plan.price}</span>
                <span className="text-muted-foreground text-sm">/month</span>
              </div>
              <ul className="space-y-2 mb-6 text-sm">
                {plan.features.map(f => (
                  <li key={f} className="flex items-center gap-2 text-foreground">
                    <span className="w-4 h-4 rounded-full flex items-center justify-center flex-shrink-0 check-icon-skeu">
                      <Check className="w-2.5 h-2.5 text-white" />
                    </span>
                    {f}
                  </li>
                ))}
                {plan.missing.map(f => (
                  <li key={f} className="flex items-center gap-2 text-muted-foreground">
                    <span className="w-4 h-4 rounded-full flex items-center justify-center flex-shrink-0 missing-icon-skeu">
                      <X className="w-2.5 h-2.5 text-muted-foreground" />
                    </span>
                    {f}
                  </li>
                ))}
              </ul>
              {isCurrent ? (
                <Button variant="outline" className="w-full" disabled>Current Plan</Button>
              ) : (
                <Button
                  className="w-full"
                  variant={plan.price > 29 ? 'default' : 'outline'}
                  onClick={() => handlePlanAction(plan.name)}
                  disabled={loadingPlan === plan.name}
                >
                  {loadingPlan === plan.name ? 'Processing...' : plan.price === 0 ? 'Downgrade' : 'Upgrade'}
                </Button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default SubscriptionPage;
