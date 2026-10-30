<?php

namespace Tests\Feature\Settings;

use App\Livewire\Settings\ApiTokens;
use App\Models\User;
use App\Models\UserApiToken;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Livewire\Livewire;
use Tests\TestCase;

class ApiTokensTest extends TestCase
{
    use RefreshDatabase;

    public function test_the_page_is_displayed(): void
    {
        $this->actingAs(User::factory()->create());

        $this->get('/settings/api-tokens')->assertOk();
    }

    public function test_a_token_can_be_minted_from_the_dashboard(): void
    {
        $user = User::factory()->create();
        $this->actingAs($user);

        $component = Livewire::test(ApiTokens::class)
            ->set('name', 'Laptop agent')
            ->set('hosts', 'https://www.haysmed.com, www.pawneevalleyhospital.com')
            ->call('mint')
            ->assertHasNoErrors();

        $key = $component->get('plaintextKey');
        $this->assertStringStartsWith(UserApiToken::PREFIX, $key);

        $token = UserApiToken::where('user_id', $user->id)->sole();
        $this->assertSame('Laptop agent', $token->name);
        $this->assertSame(['www.haysmed.com', 'www.pawneevalleyhospital.com'], $token->allowed_hosts);
        // Only the hash is stored.
        $this->assertSame(hash('sha256', $key), $token->token_hash);
    }

    public function test_a_blank_host_list_means_any_host(): void
    {
        $this->actingAs($user = User::factory()->create());

        Livewire::test(ApiTokens::class)
            ->set('name', 'Any host')
            ->call('mint')
            ->assertHasNoErrors();

        $this->assertNull(UserApiToken::where('user_id', $user->id)->sole()->allowed_hosts);
    }

    public function test_a_user_can_revoke_their_own_token_but_not_someone_elses(): void
    {
        $mine = User::factory()->create();
        $theirs = User::factory()->create();

        $this->actingAs($mine);

        Livewire::test(ApiTokens::class)->set('name', 'Mine')->call('mint');
        $myToken = UserApiToken::where('user_id', $mine->id)->sole();

        $theirToken = UserApiToken::create([
            'user_id' => $theirs->id,
            'name' => 'Theirs',
            'token_hash' => hash('sha256', 'g3u_someone-else'),
        ]);

        Livewire::test(ApiTokens::class)->call('revoke', $theirToken->id);
        $this->assertNull($theirToken->fresh()->revoked_at);

        Livewire::test(ApiTokens::class)->call('revoke', $myToken->id);
        $this->assertNotNull($myToken->fresh()->revoked_at);
    }
}
