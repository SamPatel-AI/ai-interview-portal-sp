import { Request, Response, NextFunction } from 'express';
import { supabaseAdmin } from '../config/database';
import { AuthUser, UserRole } from '../types';
import { AppError } from './errorHandler';

/**
 * Verify Supabase JWT and attach user context to request.
 * Uses Supabase's own getUser() which validates the token server-side.
 */
export async function authenticate(
  req: Request,
  _res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      throw new AppError(401, 'Missing or invalid authorization header');
    }

    const token = authHeader.substring(7);

    // Use Supabase to verify the token (no manual JWT secret needed)
    const { data: { user: authUser }, error: authError } = await supabaseAdmin.auth.getUser(token);

    if (authError || !authUser) {
      throw new AppError(401, 'Invalid or expired token');
    }

    // Fetch user profile from our users table
    const { data: user, error } = await supabaseAdmin
      .from('users')
      .select('id, org_id, email, full_name, role, is_active')
      .eq('id', authUser.id)
      .single();

    if (error || !user) {
      throw new AppError(401, 'User not found');
    }

    if (!user.is_active) {
      throw new AppError(403, 'Account is deactivated');
    }

    req.user = {
      id: user.id,
      email: user.email,
      org_id: user.org_id,
      role: user.role as UserRole,
    };

    next();
  } catch (err) {
    if (err instanceof AppError) {
      next(err);
      return;
    }
    next(new AppError(401, 'Invalid or expired token'));
  }
}

/**
 * Role-based access control middleware.
 * Usage: requireRole('admin', 'recruiter')
 */
export function requireRole(...allowedRoles: UserRole[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) {
      return next(new AppError(401, 'Not authenticated'));
    }
    if (!allowedRoles.includes(req.user.role)) {
      return next(new AppError(403, 'Insufficient permissions'));
    }
    next();
  };
}

/**
 * Ensure the user can only access resources within their organization.
 * Attaches org_id filter to the request for downstream use.
 */
export function orgScope(req: Request, _res: Response, next: NextFunction) {
  if (!req.user?.org_id) {
    return next(new AppError(401, 'Not authenticated'));
  }
  next();
}
