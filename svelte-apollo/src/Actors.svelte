<script context="module" lang="ts">
  import gql from "graphql-tag";
  import { client } from "./apollo";
  import { Chain, Gql } from "../utils/generated/zeus";
  const Actors = Gql("query")({
    actor: [
      {
        limit: 100,
      },
      {
        first_name: true,
      },
    ],
  });

  export async function preload() {
    return {
      cache: await client.query({ query: Actors }),
    };
  }
</script>

<script lang="ts">
  import { restore, query } from "svelte-apollo";

  export let cache;
  restore(client, Actors, cache.data);

  const actors = query(client, { query: Actors });
</script>

<ul>
  {#await $actors}
    <li>Loading...</li>
  {:then result}
    {#each result.data.actor as actor (actor.id)}
      <li>{actor.first_name}</li>
    {:else}
      <li>No articles found</li>
    {/each}
  {:catch error}
    <li>Error loading articles: {error}</li>
  {/await}
</ul>
