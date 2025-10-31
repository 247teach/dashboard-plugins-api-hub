import { Router, Response } from 'express';
import { mathPluginSupabase } from '../config/supabase';
import { authenticateToken, AuthRequest } from '../middleware/auth';

const router = Router();

// Apply authentication middleware to all math routes
router.use(authenticateToken);

// Helper function to enrich standards with module and topic data
async function enrichStandardsWithRelations(standards: any[]) {
  // Get all unique module_ids and topic_ids
  const moduleIds = [...new Set(standards.map((s) => s.module_id))];
  const topicIds = [...new Set(standards.map((s) => s.topic_id))];

  // Fetch all modules and topics
  const [modulesResponse, topicsResponse] = await Promise.all([
    mathPluginSupabase.from('modules').select('id, name, description, display_order').in('id', moduleIds),
    mathPluginSupabase.from('topics').select('id, name').in('id', topicIds),
  ]);

  // Create lookup maps
  const modulesMap = new Map(modulesResponse.data?.map((m) => [m.id, m]) || []);
  const topicsMap = new Map(topicsResponse.data?.map((t) => [t.id, t]) || []);

  // Enrich standards with module and topic data
  return standards.map((standard) => ({
    id: standard.id,
    standard_code: standard.standard_code,
    description: standard.description,
    created_at: standard.created_at,
    module: modulesMap.get(standard.module_id) || null,
    topic: topicsMap.get(standard.topic_id) || null,
  }));
}

// GET /api/v1/math/standards - Get list of all math standards with module and topic details
router.get('/standards', async (_req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { data: standards, error } = await mathPluginSupabase
      .from('standards')
      .select('id, standard_code, description, module_id, topic_id, created_at');

    if (error) {
      res.status(500).json({ error: 'Failed to fetch standards', details: error.message });
      return;
    }

    if (!standards || standards.length === 0) {
      res.json({
        success: true,
        data: [],
      });
      return;
    }

    const enrichedData = await enrichStandardsWithRelations(standards);

    res.json({
      success: true,
      data: enrichedData,
    });
  } catch (error) {
    console.error('Error fetching standards:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/v1/math/standards/:id - Get a specific standard by ID with module and topic details
router.get('/standards/:id', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    const { data: standard, error } = await mathPluginSupabase
      .from('standards')
      .select('id, standard_code, description, module_id, topic_id, created_at')
      .eq('id', id)
      .single();

    if (error || !standard) {
      res.status(404).json({ error: 'Standard not found', details: error?.message });
      return;
    }

    // Fetch module and topic data
    const [moduleResponse, topicResponse] = await Promise.all([
      mathPluginSupabase.from('modules').select('id, name, description, display_order').eq('id', standard.module_id).single(),
      mathPluginSupabase.from('topics').select('id, name').eq('id', standard.topic_id).single(),
    ]);

    const enrichedStandard = {
      id: standard.id,
      standard_code: standard.standard_code,
      description: standard.description,
      created_at: standard.created_at,
      module: moduleResponse.data || null,
      topic: topicResponse.data || null,
    };

    res.json({
      success: true,
      data: enrichedStandard,
    });
  } catch (error) {
    console.error('Error fetching standard:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
