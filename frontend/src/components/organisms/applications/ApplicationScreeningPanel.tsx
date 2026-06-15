import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Loader2, Sparkles, CheckCircle, XCircle, AlertTriangle, Trophy, FileText,
} from 'lucide-react';
import type { ScreeningResult, ApplicationDetail } from '@/domains/applications';
import { formatFactor, getFactorExplanation, getScore, scoreBg, scoreColor } from './applicationDetailHelpers';

interface Props {
  score: ApplicationDetail['ai_screening_score'];
  result: ScreeningResult | null;
  screening: boolean;
  onScreen: () => void;
}

export default function ApplicationScreeningPanel({ score, result, screening, onScreen }: Props) {
  const s = getScore(score);

  return (
    <div className="space-y-4">
      <h3 className="text-sm font-semibold flex items-center gap-2">
        <FileText className="h-4 w-4" /> Resume Screening
      </h3>

      <div className="flex items-center gap-4">
        <div className={`h-16 w-16 rounded-xl flex items-center justify-center ${scoreBg(s)}`}>
          <span className={`text-2xl font-bold ${scoreColor(s)}`}>{s ?? '?'}</span>
        </div>
        <div className="flex-1">
          {s !== null ? (
            <p className="text-sm text-muted-foreground">
              AI Score: <span className={`font-semibold ${scoreColor(s)}`}>{s}/10</span>
            </p>
          ) : (
            <Button onClick={onScreen} disabled={screening} size="sm">
              {screening
                ? <><Loader2 className="h-4 w-4 animate-spin mr-2" />Analyzing...</>
                : <><Sparkles className="h-4 w-4 mr-2" />Screen with AI</>}
            </Button>
          )}
        </div>
      </div>

      {result && (
        <div className="space-y-3 bg-muted/30 rounded-lg p-4">
          {result.candidate_strengths?.length ? (
            <div className="space-y-1.5">
              <p className="text-xs font-medium text-success flex items-center gap-1"><CheckCircle className="h-3.5 w-3.5" />Strengths</p>
              {result.candidate_strengths.map((str, i) => (
                <p key={i} className="text-sm text-muted-foreground pl-5">• {str}</p>
              ))}
            </div>
          ) : null}
          {result.candidate_weaknesses?.length ? (
            <div className="space-y-1.5">
              <p className="text-xs font-medium text-destructive flex items-center gap-1"><XCircle className="h-3.5 w-3.5" />Weaknesses</p>
              {result.candidate_weaknesses.map((w, i) => (
                <p key={i} className="text-sm text-muted-foreground pl-5">• {w}</p>
              ))}
            </div>
          ) : null}
          <div className="flex flex-wrap gap-3">
            {result.risk_factor && (
              <Badge variant="outline" className="border-warning/30 text-warning gap-1" title={getFactorExplanation(result.risk_factor) ?? undefined}>
                <AlertTriangle className="h-3 w-3" />Risk: {formatFactor(result.risk_factor)}
              </Badge>
            )}
            {result.reward_factor && (
              <Badge variant="outline" className="border-success/30 text-success gap-1" title={getFactorExplanation(result.reward_factor) ?? undefined}>
                <Trophy className="h-3 w-3" />Reward: {formatFactor(result.reward_factor)}
              </Badge>
            )}
          </div>
          {getFactorExplanation(result.risk_factor) && (
            <p className="text-sm text-muted-foreground bg-warning/5 p-3 rounded-lg">
              <span className="font-medium text-warning">Risk:</span> {getFactorExplanation(result.risk_factor)}
            </p>
          )}
          {getFactorExplanation(result.reward_factor) && (
            <p className="text-sm text-muted-foreground bg-success/5 p-3 rounded-lg">
              <span className="font-medium text-success">Reward:</span> {getFactorExplanation(result.reward_factor)}
            </p>
          )}
          {result.justification_for_rating && (
            <p className="text-sm text-muted-foreground bg-muted p-3 rounded-lg">{result.justification_for_rating}</p>
          )}
        </div>
      )}
    </div>
  );
}
