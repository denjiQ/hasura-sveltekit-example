<script context="module" lang="ts">
	import { client } from '../lib/apollo';
	import { order_by } from '../lib/zeus';
	import { typedGql } from '../lib/zeus/typedDocumentNode';

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

	export const actors = await client.query({ query });
</script>

<ul>
	{#await actors}
		<li>Loading...</li>
	{:then result}
		{#each result.data.actor as actor (actor.actor_id)}
			<li>{actor.first_name} {actor.last_name}</li>
		{:else}
			<li>No articles found</li>
		{/each}
	{:catch error}
		<li>Error loading articles: {error}</li>
	{/await}
</ul>
