<script>
	import ApolloClient from "apollo-client";
	import { client } from "./apollo";
	import { setClient } from "svelte-apollo";
	import Articles, { preload as articlePreload } from "./Actors.svelte";
	import Authors, { preload as authorPreload } from "./Authors.svelte";
	import AddAuthor from "./AddAuthor.svelte";
	import AuthorsSubscription from "./AuthorsSubscription.svelte";
	import Actors from "./Actors.svelte";

	// Approximate sapper preload
	const articlePreloading = articlePreload();

	setClient(client);
</script>

<section>
	<h2>Articles (simple query)</h2>

	{#await articlePreloading}
		<p>Preloading articles....</p>
	{:then preloaded}
		<Actors {...preloaded} />
	{:catch error}
		<p>Error preloading articles: {error}</p>
	{/await}

	<h2>Authors (simple query with cache updates)</h2>

	<!-- <h2>Authors (subscription)</h2>
	<AuthorsSubscription /> -->
</section>

<style>
	h1 {
		color: purple;
	}
</style>
