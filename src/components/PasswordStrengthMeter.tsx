import { useMemo } from 'react';
import { Check, X } from 'lucide-react';
import { Progress } from '@/components/ui/progress';
import { cn } from '@/lib/utils';

export interface PasswordPolicy {
  minLength: boolean;
  hasUppercase: boolean;
  hasLowercase: boolean;
  hasNumber: boolean;
  hasSpecial: boolean;
}

export function evaluatePassword(password: string): { score: number; policy: PasswordPolicy } {
  const policy: PasswordPolicy = {
    minLength: password.length >= 8,
    hasUppercase: /[A-Z]/.test(password),
    hasLowercase: /[a-z]/.test(password),
    hasNumber: /[0-9]/.test(password),
    hasSpecial: /[^A-Za-z0-9]/.test(password),
  };
  const score = Object.values(policy).filter(Boolean).length;
  return { score, policy };
}

export function isPasswordValid(password: string): boolean {
  const { policy } = evaluatePassword(password);
  return Object.values(policy).every(Boolean);
}

const strengthLabels: Record<number, { label: string; color: string }> = {
  0: { label: 'Very Weak', color: 'bg-destructive' },
  1: { label: 'Weak', color: 'bg-destructive' },
  2: { label: 'Fair', color: 'bg-orange-500' },
  3: { label: 'Good', color: 'bg-yellow-500' },
  4: { label: 'Strong', color: 'bg-primary' },
  5: { label: 'Very Strong', color: 'bg-green-500' },
};

const rules = [
  { key: 'minLength' as const, label: 'At least 8 characters' },
  { key: 'hasUppercase' as const, label: 'One uppercase letter' },
  { key: 'hasLowercase' as const, label: 'One lowercase letter' },
  { key: 'hasNumber' as const, label: 'One number' },
  { key: 'hasSpecial' as const, label: 'One special character' },
];

export function PasswordStrengthMeter({ password }: { password: string }) {
  const { score, policy } = useMemo(() => evaluatePassword(password), [password]);
  const { label, color } = strengthLabels[score];

  if (!password) return null;

  return (
    <div className="space-y-2 mt-2">
      <div className="flex items-center gap-2">
        <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden">
          <div
            className={cn('h-full rounded-full transition-all duration-300', color)}
            style={{ width: `${(score / 5) * 100}%` }}
          />
        </div>
        <span className="text-xs font-medium text-muted-foreground w-20 text-right">{label}</span>
      </div>
      <ul className="grid grid-cols-1 sm:grid-cols-2 gap-1">
        {rules.map(({ key, label }) => (
          <li key={key} className="flex items-center gap-1.5 text-xs">
            {policy[key] ? (
              <Check className="w-3 h-3 text-green-500 shrink-0" />
            ) : (
              <X className="w-3 h-3 text-muted-foreground shrink-0" />
            )}
            <span className={cn(policy[key] ? 'text-foreground' : 'text-muted-foreground')}>{label}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
