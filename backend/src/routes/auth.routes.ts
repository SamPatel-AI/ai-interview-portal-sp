import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { supabaseAdmin } from '../config/database';
import { authenticate } from '../middleware/auth';
import { authLimiter } from '../middleware/rateLimiter';
import { AppError } from '../middleware/errorHandler';
import { AuthenticatedRequest } from '../types';
import { logger } from '../utils/logger';

const router = Router();

// ─── Validation Schemas ────────────────────────────────────

const signupSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  full_name: z.string().min(1),
  org_name: z.string().min(1).optional(), // If creating a new org
  org_id: z.string().uuid().optional(),   // If joining existing org
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

// ─── POST /api/auth/signup ─────────────────────────────────

router.post('/signup', authLimiter, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const body = signupSchema.parse(req.body);

    // Create Supabase auth user
    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email: body.email,
      password: body.password,
      email_confirm: true,
    });

    if (authError) {
      throw new AppError(400, authError.message);
    }

    const userId = authData.user.id;

    // Create or join organization
    let orgId: string;

    if (body.org_id) {
      // Joining existing org
      const { data: org, error } = await supabaseAdmin
        .from('organizations')
        .select('id')
        .eq('id', body.org_id)
        .single();

      if (error || !org) {
        throw new AppError(404, 'Organization not found');
      }
      orgId = org.id;
    } else {
      // Create new org
      const orgName = body.org_name || `${body.full_name}'s Organization`;
      const { data: org, error } = await supabaseAdmin
        .from('organizations')
        .insert({ name: orgName })
        .select('id')
        .single();

      if (error || !org) {
        throw new AppError(500, 'Failed to create organization');
      }
      orgId = org.id;
    }

    // Create user profile
    const role = body.org_id ? 'recruiter' : 'admin'; // First user is admin
    const { error: profileError } = await supabaseAdmin
      .from('users')
      .insert({
        id: userId,
        org_id: orgId,
        email: body.email,
        full_name: body.full_name,
        role,
      });

    if (profileError) {
      logger.error('Failed to create user profile:', profileError);
      // Clean up auth user
      await supabaseAdmin.auth.admin.deleteUser(userId);
      throw new AppError(500, 'Failed to create user profile');
    }

    // Log activity
    await supabaseAdmin.from('activity_log').insert({
      org_id: orgId,
      user_id: userId,
      entity_type: 'user',
      entity_id: userId,
      action: 'signup',
      details: { email: body.email },
    });

    res.status(201).json({
      success: true,
      data: {
        user_id: userId,
        org_id: orgId,
        email: body.email,
        role,
      },
    });
  } catch (err) {
    next(err);
  }
});

// ─── POST /api/auth/login ──────────────────────────────────

router.post('/login', authLimiter, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const body = loginSchema.parse(req.body);

    const { data, error } = await supabaseAdmin.auth.signInWithPassword({
      email: body.email,
      password: body.password,
    });

    if (error) {
      throw new AppError(401, 'Invalid email or password');
    }

    // Fetch user profile
    const { data: user, error: userError } = await supabaseAdmin
      .from('users')
      .select('*')
      .eq('id', data.user.id)
      .single();

    if (userError || !user) {
      throw new AppError(401, 'User profile not found');
    }

    if (!user.is_active) {
      throw new AppError(403, 'Account is deactivated');
    }

    res.json({
      success: true,
      data: {
        access_token: data.session.access_token,
        refresh_token: data.session.refresh_token,
        expires_at: data.session.expires_at,
        user: {
          id: user.id,
          org_id: user.org_id,
          email: user.email,
          full_name: user.full_name,
          role: user.role,
          avatar_url: user.avatar_url,
        },
      },
    });
  } catch (err) {
    next(err);
  }
});

// ─── GET /api/auth/me ──────────────────────────────────────

router.get('/me', authenticate as any, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const authReq = req as AuthenticatedRequest;

    const { data: user, error } = await supabaseAdmin
      .from('users')
      .select(`
        *,
        organizations (id, name, logo_url)
      `)
      .eq('id', authReq.user.id)
      .single();

    if (error || !user) {
      throw new AppError(404, 'User not found');
    }

    res.json({ success: true, data: user });
  } catch (err) {
    next(err);
  }
});

// ─── POST /api/auth/refresh ────────────────────────────────

router.post('/refresh', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { refresh_token } = req.body;
    if (!refresh_token) {
      throw new AppError(400, 'Refresh token required');
    }

    const { data, error } = await supabaseAdmin.auth.refreshSession({
      refresh_token,
    });

    if (error || !data.session) {
      throw new AppError(401, 'Invalid refresh token');
    }

    res.json({
      success: true,
      data: {
        access_token: data.session.access_token,
        refresh_token: data.session.refresh_token,
        expires_at: data.session.expires_at,
      },
    });
  } catch (err) {
    next(err);
  }
});

export default router;
