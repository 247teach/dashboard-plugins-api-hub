import { Router, Request, Response } from 'express';
import { dashboardSupabase } from '../config/supabase';
import { generateToken } from '../utils/jwt';

const router = Router();

router.post('/token', async (req: Request, res: Response): Promise<void> => {
  try {
    const authHeader = req.headers['authorization'];
    const supabaseToken = authHeader && authHeader.split(' ')[1];

    if (!supabaseToken) {
      res.status(401).json({ error: 'Supabase token required' });
      return;
    }

    // Validate the Supabase token with dashboard's Supabase
    const {
      data: { user },
      error,
    } = await dashboardSupabase.auth.getUser(supabaseToken);

    if (error || !user) {
      res.status(401).json({ error: 'Invalid Supabase token' });
      return;
    }

    // Generate API JWT token
    const apiToken = generateToken({
      userId: user.id,
      email: user.email || '',
    });

    res.json({
      token: apiToken,
      expiresIn: process.env.JWT_EXPIRES_IN || '24h',
      user: {
        id: user.id,
        email: user.email,
      },
    });
  } catch (error) {
    console.error('Token generation error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
