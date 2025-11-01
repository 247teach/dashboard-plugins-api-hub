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

// GET /api/v1/math/practice-history/:cleverId/mastery - Get aggregated mastery data for a user by Clever ID
router.get('/practice-history/:cleverId/mastery', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { cleverId } = req.params;

    // First, lookup the internal user ID from auth using Clever ID
    const { data: usersData, error: authError } = await mathPluginSupabase.auth.admin.listUsers();

    if (authError) {
      res.status(500).json({ error: 'Failed to fetch users', details: authError.message });
      return;
    }

    // Find user with matching Clever ID in metadata
    const authUser = usersData.users.find(
      (user) => user.user_metadata?.clever_id === cleverId
    );

    if (!authUser) {
      res.status(404).json({ error: 'User not found with this Clever ID' });
      return;
    }

    const userId = authUser.id;

    // Fetch practice history with question pool data
    const { data: practiceHistory, error } = await mathPluginSupabase
      .from('practice_history')
      .select(`
        id,
        correct,
        response_time_ms,
        created_at,
        module_id,
        topic_id,
        question_id,
        question_type,
        reference_question_id
      `)
      .eq('user_id', userId);

    if (error) {
      res.status(500).json({ error: 'Failed to fetch practice history', details: error.message });
      return;
    }

    if (!practiceHistory || practiceHistory.length === 0) {
      res.json({
        success: true,
        data: [],
      });
      return;
    }

    // Get unique question IDs (both saved and reference questions)
    const savedQuestionIds = practiceHistory
      .filter((p) => p.question_type === 'saved' && p.question_id)
      .map((p) => p.question_id);
    const referenceQuestionIds = practiceHistory
      .filter((p) => p.question_type === 'on_the_fly' && p.reference_question_id)
      .map((p) => p.reference_question_id);
    const allQuestionIds = [...new Set([...savedQuestionIds, ...referenceQuestionIds])];

    // Fetch questions pool data for standards codes
    const { data: questions, error: questionsError } = await mathPluginSupabase
      .from('questions_pool')
      .select('id, ny_standards_codes, module_id, topic_id')
      .in('id', allQuestionIds);

    if (questionsError) {
      res.status(500).json({ error: 'Failed to fetch question data', details: questionsError.message });
      return;
    }

    // Create question lookup map
    const questionsMap = new Map(questions?.map((q) => [q.id, q]) || []);

    // Build mastery data grouped by standard code
    const masteryMap = new Map<string, any>();

    practiceHistory.forEach((practice) => {
      // Get the question data
      const questionId = practice.question_type === 'saved' ? practice.question_id : practice.reference_question_id;
      const question = questionId ? questionsMap.get(questionId) : null;

      if (!question || !question.ny_standards_codes) return;

      // Process each standard code for this question
      question.ny_standards_codes.forEach((standardCode: string) => {
        if (!masteryMap.has(standardCode)) {
          masteryMap.set(standardCode, {
            standard_code: standardCode,
            module_id: practice.module_id || question.module_id,
            topic_id: practice.topic_id || question.topic_id,
            total_attempts: 0,
            correct_count: 0,
            incorrect_count: 0,
            response_times: [],
            last_attempted: practice.created_at,
          });
        }

        const mastery = masteryMap.get(standardCode);
        mastery.total_attempts += 1;
        if (practice.correct) {
          mastery.correct_count += 1;
        } else {
          mastery.incorrect_count += 1;
        }
        if (practice.response_time_ms) {
          mastery.response_times.push(practice.response_time_ms);
        }
        if (new Date(practice.created_at) > new Date(mastery.last_attempted)) {
          mastery.last_attempted = practice.created_at;
        }
      });
    });

    // Calculate final mastery percentages and averages
    const masteryData = Array.from(masteryMap.values()).map((mastery) => ({
      standard_code: mastery.standard_code,
      module_id: mastery.module_id,
      topic_id: mastery.topic_id,
      total_attempts: mastery.total_attempts,
      correct_count: mastery.correct_count,
      incorrect_count: mastery.incorrect_count,
      mastery_percentage: mastery.total_attempts > 0
        ? Math.round((mastery.correct_count / mastery.total_attempts) * 100 * 10) / 10
        : 0,
      avg_response_time_ms: mastery.response_times.length > 0
        ? Math.round(mastery.response_times.reduce((a: number, b: number) => a + b, 0) / mastery.response_times.length)
        : null,
      last_attempted: mastery.last_attempted,
    }));

    res.json({
      success: true,
      data: masteryData,
    });
  } catch (error) {
    console.error('Error calculating mastery:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
