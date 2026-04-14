import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { supabaseAdmin } from '../config/database';
import { authenticate, requireRole } from '../middleware/auth';
import { AppError } from '../middleware/errorHandler';
import '../types';

const router = Router();

router.use(authenticate);

// ─── Validation ────────────────────────────────────────────

const inviteUserSchema = z.object({
  email: z.string().email(),
  full_name: z.string().min(1),
  role: z.enum(['admin', 'recruiter', 'viewer']).default('recruiter'),
});

const updateUserSchema = z.object({
  role: z.enum(['admin', 'recruiter', 'viewer']).optional(),
  full_name: z.string().min(1).optional(),
  is_active: z.boolean().optional(),
});

// ─── GET /api/users ────────────────────────────────────────
// List all users in the organization

router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('users')
      .select('id, email, full_name, role, avatar_url, is_active, created_at')
      .eq('org_id', req.user!.org_id)
      .order('created_at', { ascending: true });

    if (error) throw new AppError(500, 'Failed to fetch users');

    res.json({ success: true, data: data || [] });
  } catch (err) {
    next(err);
  }
});

// ─── POST /api/users/invite ────────────────────────────────
// Invite a new user to the organization (admin only)

router.post(
  '/invite',
  requireRole('admin'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const body = inviteUserSchema.parse(req.body);

      // Check if user already exists in org
      const { data: existing } = await supabaseAdmin
        .from('users')
        .select('id')
        .eq('org_id', req.user!.org_id)
        .eq('email', body.email)
        .single();

      if (existing) {
        throw new AppError(409, 'User with this email already exists in your organization');
      }

      // Create auth user via Supabase admin (sends invite email)
      const { data: authUser, error: authError } = await supabaseAdmin.auth.admin.inviteUserByEmail(
        body.email,
        { data: { full_name: body.full_name } }
      );

      if (authError) {
        // User might already exist in auth but not in this org
        if (authError.message?.includes('already been registered')) {
          // Look up existing auth user
          const { data: { users: existingUsers } } = await supabaseAdmin.auth.admin.listUsers();
          const existingAuth = existingUsers?.find(u => u.email === body.email);

          if (existingAuth) {
            // Add them to this org
            const { data: newUser, error: insertError } = await supabaseAdmin
              .from('users')
              .insert({
                id: existingAuth.id,
                org_id: req.user!.org_id,
                email: body.email,
                full_name: body.full_name,
                role: body.role,
              })
              .select()
              .single();

            if (insertError) throw new AppError(500, 'Failed to add user to organization');

            await supabaseAdmin.from('activity_log').insert({
              org_id: req.user!.org_id,
              user_id: req.user!.id,
              entity_type: 'user',
              entity_id: newUser.id,
              action: 'invited',
              details: { email: body.email, role: body.role },
            });

            return res.status(201).json({ success: true, data: newUser });
          }
        }
        throw new AppError(500, `Failed to invite user: ${authError.message}`);
      }

      // Create user record in our users table
      const { data: newUser, error: insertError } = await supabaseAdmin
        .from('users')
        .insert({
          id: authUser.user.id,
          org_id: req.user!.org_id,
          email: body.email,
          full_name: body.full_name,
          role: body.role,
        })
        .select()
        .single();

      if (insertError) throw new AppError(500, 'Failed to create user record');

      await supabaseAdmin.from('activity_log').insert({
        org_id: req.user!.org_id,
        user_id: req.user!.id,
        entity_type: 'user',
        entity_id: newUser.id,
        action: 'invited',
        details: { email: body.email, role: body.role },
      });

      res.status(201).json({ success: true, data: newUser });
    } catch (err) {
      next(err);
    }
  }
);

// ─── PATCH /api/users/:id ──────────────────────────────────
// Update a user's role or status (admin only, or self for name)

router.patch(
  '/:id',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const body = updateUserSchema.parse(req.body);
      const targetUserId = req.params.id;

      // Only admins can change roles and active status of other users
      if (targetUserId !== req.user!.id) {
        if (req.user!.role !== 'admin') {
          throw new AppError(403, 'Only admins can modify other users');
        }
      }

      // Non-admins can only update their own full_name
      if (targetUserId === req.user!.id && req.user!.role !== 'admin') {
        if (body.role || body.is_active !== undefined) {
          throw new AppError(403, 'You cannot change your own role or status');
        }
      }

      // Prevent admin from deactivating themselves
      if (targetUserId === req.user!.id && body.is_active === false) {
        throw new AppError(400, 'You cannot deactivate your own account');
      }

      const { data, error } = await supabaseAdmin
        .from('users')
        .update(body)
        .eq('id', targetUserId)
        .eq('org_id', req.user!.org_id)
        .select()
        .single();

      if (error || !data) throw new AppError(404, 'User not found');

      await supabaseAdmin.from('activity_log').insert({
        org_id: req.user!.org_id,
        user_id: req.user!.id,
        entity_type: 'user',
        entity_id: targetUserId,
        action: 'updated',
        details: body,
      });

      res.json({ success: true, data });
    } catch (err) {
      next(err);
    }
  }
);

export default router;
