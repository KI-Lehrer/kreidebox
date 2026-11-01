import { auth } from '../_lib/auth.js';
import { oAuthProtectedResourceMetadata } from 'better-auth/plugins';

export const GET = oAuthProtectedResourceMetadata(auth);
