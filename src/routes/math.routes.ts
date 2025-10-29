import { Router, Response } from 'express';
import { mathPluginSupabase } from '../config/supabase';
import { authenticateToken, AuthRequest } from '../middleware/auth';

const router = Router();

// Apply authentication middleware to all math routes
router.use(authenticateToken);

// GET /api/v1/math/standards - Get list of all math standards
router.get('/standards', async (_req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { data, error } = await mathPluginSupabase.from('standards').select('*');

    if (error) {
      res.status(500).json({ error: 'Failed to fetch standards', details: error.message });
      return;
    }

    res.json({
      success: true,
      data,
    });
  } catch (error) {
    console.error('Error fetching standards:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/v1/math/standards/:id - Get a specific standard by ID
router.get('/standards/:id', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    const { data, error } = await mathPluginSupabase
      .from('standards')
      .select('*')
      .eq('id', id)
      .single();

    if (error) {
      res.status(404).json({ error: 'Standard not found', details: error.message });
      return;
    }

    res.json({
      success: true,
      data,
    });
  } catch (error) {
    console.error('Error fetching standard:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
