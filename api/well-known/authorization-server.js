import { auth } from '../_lib/auth.js';
import { oAuthDiscoveryMetadata } from 'better-auth/plugins';

export const GET = oAuthDiscoveryMetadata(auth);
