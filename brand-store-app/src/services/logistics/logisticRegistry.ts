import { unifiedConfig } from '../../config/unifiedConfig.js';
import { LogisticAggregator, logisticAggregator } from './logisticAggregator.js';
import { TembusOnDemandProvider } from './tembusOnDemandProvider.js';
import { TembusAggregatorProvider } from './tembusAggregatorProvider.js';

export function buildLogisticAggregator(): LogisticAggregator {
  const aggregator = new LogisticAggregator();

  aggregator.register(
    new TembusOnDemandProvider({
      baseUrl: unifiedConfig.tembus.onDemand.baseUrl,
      apiKey: unifiedConfig.tembus.apiKey,
      webhookSecret: unifiedConfig.tembus.webhookSecret,
      models: unifiedConfig.tembus.onDemand.models,
      timeoutMs: unifiedConfig.tembus.onDemand.timeoutMs,
    })
  );

  aggregator.register(
    new TembusAggregatorProvider({
      baseUrl: unifiedConfig.tembus.aggregator.baseUrl,
      token: unifiedConfig.tembus.aggregator.token,
      providers: unifiedConfig.tembus.aggregator.providers,
      timeoutMs: unifiedConfig.tembus.aggregator.timeoutMs,
    })
  );

  return aggregator;
}

let registered = false;

export function ensureLogisticProvidersRegistered(): LogisticAggregator {
  if (!registered) {
    const built = buildLogisticAggregator();
    for (const name of built.names()) {
      logisticAggregator.register(built.get(name));
    }
    registered = true;
  }
  return logisticAggregator;
}
