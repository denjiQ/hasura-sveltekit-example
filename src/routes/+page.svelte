<script lang="ts">
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
</script>

<ul>
	{#await data}
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
