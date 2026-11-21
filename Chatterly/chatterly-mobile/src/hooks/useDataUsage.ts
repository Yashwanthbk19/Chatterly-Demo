import {useSyncExternalStore} from 'react';
import {getDataUsage, subscribeToDataUsage} from '../services/dataUsage';

export function useDataUsage() {
  return useSyncExternalStore(subscribeToDataUsage, getDataUsage, getDataUsage);
}
