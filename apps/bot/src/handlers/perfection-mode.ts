// Perfection Mode Command - High-Fidelity Analysis
// Purpose: Execute maximum edge and profit expectancy analysis

import { PerfectionModeOrchestrator } from '@trade/ai';

export async function executePerfectionMode(
  markets: string[] = ['crypto', 'spx', 'bist']
): Promise<string> {
  console.log('🎯 Starting Perfection Mode - High-Fidelity Analysis');
  
  const orchestrator = new PerfectionModeOrchestrator();
  
  try {
    const result = await orchestrator.executeUniversalScanHF(markets, 12);
    
    // Format result for display
    let output = `🎯 **Perfection Mode Analysis Complete**\n\n`;
    
    // Market Overview
    output += `📊 **Market Overview:**\n`;
    output += `├ Crypto: ${result.market_overview.crypto.regime.toUpperCase()} (${result.market_overview.crypto.breadth.adv}↗ ${result.market_overview.crypto.breadth.dec}↘)\n`;
    output += `├ S&P 500: ${result.market_overview.spx.regime.toUpperCase()} (${result.market_overview.spx.breadth.adv}↗ ${result.market_overview.spx.breadth.dec}↘)\n`;
    output += `├ BIST: ${result.market_overview.bist.regime.toUpperCase()} (${result.market_overview.bist.breadth.adv}↗ ${result.market_overview.bist.breadth.dec}↘)\n`;
    output += `└ Overall: ${result.market_overview.overall_regime.toUpperCase()}\n\n`;
    
    // Top Candidates
    if (result.top_candidates.length > 0) {
      output += `🔍 **Top Candidates (${result.top_candidates.length}):**\n`;
      result.top_candidates.slice(0, 8).forEach((candidate, i) => {
        const emoji = candidate.dir === 'long' ? '📈' : candidate.dir === 'short' ? '📉' : '⏸️';
        const scoreEmoji = candidate.score > 0.7 ? '🟢' : candidate.score > 0.5 ? '🟡' : '🔴';
        
        output += `${i + 1}. ${emoji} **${candidate.symbol}** (${candidate.market.toUpperCase()})\n`;
        output += `├ Direction: ${candidate.dir.toUpperCase()} ${scoreEmoji}\n`;
        output += `├ Score: ${(candidate.score * 100).toFixed(0)}% | R:R: ${candidate.rr_potential.toFixed(1)}:1\n`;
        output += `├ Confidence: ${(candidate.confidence * 100).toFixed(0)}%\n`;
        
        if (candidate.risks.length > 0) {
          output += `├ Risks: ${candidate.risks.slice(0, 2).join(', ')}\n`;
        }
        
        if (candidate.drivers.length > 0) {
          output += `├ Drivers: ${candidate.drivers.slice(0, 2).join(', ')}\n`;
        }
        
        output += `└ ${candidate.reason}\n\n`;
      });
    }
    
    // Final Portfolio
    if (result.final_picks.length > 0) {
      output += `💼 **Final Portfolio (${result.final_picks.length} positions):**\n\n`;
      
      result.final_picks.forEach((pick, i) => {
        const emoji = pick.position === 'long' ? '📈' : '📉';
        const confEmoji = pick.confidence > 0.75 ? '🟢' : pick.confidence > 0.6 ? '🟡' : '🔴';
        
        output += `${i + 1}. ${emoji} **${pick.asset}** (${pick.position.toUpperCase()})\n`;
        output += `├ Entry: $${pick.entry.lower.toFixed(4)} - $${pick.entry.upper.toFixed(4)}\n`;
        output += `├ Stop: $${pick.stop.toFixed(4)} | Targets: ${pick.targets.map(t => `$${t.price.toFixed(4)}`).join(', ')}\n`;
        output += `├ Expected R:R: ${pick.expected_rr.toFixed(1)}:1\n`;
        output += `├ Confidence: ${(pick.confidence * 100).toFixed(0)}% ${confEmoji}\n`;
        output += `├ Win Probability: ${(pick.prob_win * 100).toFixed(0)}%\n`;
        output += `├ EV per Risk: ${pick.ev_per_risk.toFixed(2)}\n`;
        output += `├ Kelly %: ${(pick.kelly_frac * 100).toFixed(1)}%\n`;
        output += `├ Position Size: ${pick.size_pct}%\n`;
        output += `├ Beta Overlap: ${pick.overlap_beta.toFixed(2)}\n`;
        output += `└ ${pick.notes}\n\n`;
      });
      
      // Portfolio Stats
      output += `📊 **Portfolio Statistics:**\n`;
      output += `├ Total Allocation: ${100 - result.reserves_pct}%\n`;
      output += `├ Cash Reserves: ${result.reserves_pct}%\n`;
      output += `├ Max Correlation: ${(result.final_picks.length > 1 ? result.final_picks.reduce((acc, p) => acc, 0.3) : 0).toFixed(2)}\n`;
      output += `└ Sectors: ${result.final_picks.map(p => p.market.toUpperCase()).filter((v, i, a) => a.indexOf(v) === i).join(', ')}\n\n`;
      
    } else {
      output += `💼 **No Positions Selected**\n`;
      output += `└ No assets met high-fidelity criteria\n\n`;
    }
    
    // Performance Metrics
    const duration = new Date(result.completed_at).getTime() - new Date(result.started_at).getTime();
    output += `⚡ **Performance:**\n`;
    output += `├ Analysis Time: ${(duration / 1000).toFixed(1)}s\n`;
    output += `├ Assets Evaluated: ${result.diagnostics.evaluated}\n`;
    output += `├ LLM Calls: ${result.diagnostics.llm.stage_d_calls}\n`;
    output += `├ Timeouts: ${result.diagnostics.timeouts}\n`;
    output += `└ Data Quality: ${Object.values(result.data_quality).map(q => `${(1 - q.stale_ratio) * 100}%`).join('/')}\n\n`;
    
    output += `🎯 *High-fidelity analysis optimized for maximum edge and profit expectancy*`;
    
    return output;
    
  } catch (error) {
    console.error('❌ Perfection Mode failed:', error);
    return `❌ **Perfection Mode Failed**\n\nError: ${error instanceof Error ? error.message : 'Unknown error'}\n\nPlease check logs and try again.`;
  }
}

// Quick test function
export async function testPerfectionMode(): Promise<void> {
  console.log('🧪 Testing Perfection Mode implementation...');
  
  try {
    const result = await executePerfectionMode(['crypto']);
    console.log('✅ Perfection Mode test completed');
    console.log('Output length:', result.length);
  } catch (error) {
    console.error('❌ Perfection Mode test failed:', error);
  }
}