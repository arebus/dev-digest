/**
 * PR intent HTTP module.
 *
 *   GET  /pulls/:id/intent              → {intent} (stored; never calls a model)
 *   POST /pulls/:id/intent/recalculate  → PrIntentRecord (one cheap LLM call)
 *
 * Reviews derive the intent themselves through the same `container.prIntent`.
 */
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import type { PrIntentRecord, PrIntentResponse } from '@devdigest/shared';
import { getContext } from '../_shared/context.js';
import { IdParams } from '../_shared/schemas.js';

export default async function intentRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const { container } = app;

  app.get(
    '/pulls/:id/intent',
    { schema: { params: IdParams } },
    async (req): Promise<PrIntentResponse> => {
      const { workspaceId } = await getContext(container, req);
      return { intent: await container.prIntent.get(workspaceId, req.params.id) };
    },
  );

  app.post(
    '/pulls/:id/intent/recalculate',
    { schema: { params: IdParams }, config: { rateLimit: { max: 5, timeWindow: '1 minute' } } },
    async (req): Promise<PrIntentRecord> => {
      const { workspaceId } = await getContext(container, req);
      const outcome = await container.prIntent.ensure(workspaceId, req.params.id, {
        force: true,
        logger: req.log,
      });
      return outcome.record;
    },
  );
}
