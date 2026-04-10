import { useState, useCallback, useEffect } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RefreshCw } from 'lucide-react';
import { cn } from '@/lib/utils';

function generateChallenge() {
  const ops = ['+', '−'] as const;
  const op = ops[Math.floor(Math.random() * ops.length)];
  let a: number, b: number, answer: number;
  if (op === '+') {
    a = Math.floor(Math.random() * 20) + 1;
    b = Math.floor(Math.random() * 20) + 1;
    answer = a + b;
  } else {
    a = Math.floor(Math.random() * 20) + 5;
    b = Math.floor(Math.random() * a);
    answer = a - b;
  }
  return { question: `${a} ${op} ${b}`, answer };
}

interface MathCaptchaProps {
  onVerified: (verified: boolean) => void;
}

export function MathCaptcha({ onVerified }: MathCaptchaProps) {
  const [challenge, setChallenge] = useState(generateChallenge);
  const [userAnswer, setUserAnswer] = useState('');
  const [status, setStatus] = useState<'idle' | 'correct' | 'wrong'>('idle');

  const refresh = useCallback(() => {
    setChallenge(generateChallenge());
    setUserAnswer('');
    setStatus('idle');
    onVerified(false);
  }, [onVerified]);

  useEffect(() => {
    if (!userAnswer) { setStatus('idle'); onVerified(false); return; }
    const parsed = parseInt(userAnswer, 10);
    if (isNaN(parsed)) { setStatus('idle'); onVerified(false); return; }
    if (parsed === challenge.answer) {
      setStatus('correct');
      onVerified(true);
    } else {
      setStatus('wrong');
      onVerified(false);
    }
  }, [userAnswer, challenge.answer, onVerified]);

  return (
    <div className="space-y-2">
      <Label htmlFor="captcha">Security Check</Label>
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-muted text-foreground font-mono text-base font-semibold select-none min-w-[100px] justify-center">
          {challenge.question} =
        </div>
        <Input
          id="captcha"
          value={userAnswer}
          onChange={(e) => setUserAnswer(e.target.value.replace(/[^0-9-]/g, '').slice(0, 4))}
          placeholder="?"
          className={cn(
            'h-10 w-20 text-center font-mono text-base',
            status === 'correct' && 'border-green-500 focus-visible:ring-green-500',
            status === 'wrong' && userAnswer.length > 0 && 'border-destructive focus-visible:ring-destructive'
          )}
          inputMode="numeric"
          autoComplete="off"
        />
        <button
          type="button"
          onClick={refresh}
          className="p-2 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
          aria-label="New question"
        >
          <RefreshCw className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
