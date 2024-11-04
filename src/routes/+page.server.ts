import { client } from '../lib/apollo';
import { order_by } from '../lib/zeus';
import { typedGql } from '../lib/zeus/typedDocumentNode';
import type { PageServerLoad } from './$types';

const query = typedGql('query')({
    actor: [
        {
            limit: 100,
            order_by: [{ first_name: order_by.asc }]
        },
        {
            actor_id: true,
            first_name: true,
            last_name: true
        }
    ]
});

export const load: PageServerLoad = async () => {
    return await client.query({ query });
}

