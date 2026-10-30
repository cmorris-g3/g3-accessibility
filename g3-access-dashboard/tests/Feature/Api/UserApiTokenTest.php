<?php

namespace Tests\Feature\Api;

use App\Jobs\DiscoverSiteUrlsJob;
use App\Jobs\RunPageScanJob;
use App\Models\License;
use App\Models\Scan;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Queue;
use Tests\Support\LicenseHelpers;
use Tests\Support\UserTokenHelpers;
use Tests\TestCase;

class UserApiTokenTest extends TestCase
{
    use LicenseHelpers;
    use RefreshDatabase;
    use UserTokenHelpers;

    public function test_a_user_token_can_scan_any_url_with_no_site_header(): void
    {
        Queue::fake();
        ['key' => $key] = $this->mintUserToken();

        $response = $this->postJson(
            '/api/scans',
            ['type' => 'page', 'url' => 'https://www.haysmed.com/'],
            $this->tokenHeaders($key)
        );

        $response->assertStatus(202);
        $response->assertJsonPath('scan.url', 'https://www.haysmed.com/');
        Queue::assertPushed(RunPageScanJob::class);
    }

    public function test_user_token_scans_are_owned_by_the_internal_license(): void
    {
        Queue::fake();
        ['key' => $key] = $this->mintUserToken();

        $response = $this->postJson(
            '/api/scans',
            ['type' => 'page', 'url' => 'https://example.org/'],
            $this->tokenHeaders($key)
        );

        $scan = Scan::findOrFail($response->json('scan.id'));
        $this->assertTrue($scan->license->is_internal);
    }

    public function test_a_user_token_sees_dashboard_adhoc_scans(): void
    {
        ['key' => $key] = $this->mintUserToken();

        // Exactly what App\Livewire\Adhoc\Index creates.
        $adhoc = Scan::create([
            'license_id' => License::internal()->id,
            'type' => 'page',
            'status' => 'complete',
            'url' => 'https://www.pawneevalleyhospital.com/',
        ]);

        $response = $this->getJson('/api/scans', $this->tokenHeaders($key));

        $response->assertOk();
        $response->assertJsonPath('scans.0.id', $adhoc->id);
    }

    public function test_a_user_token_cannot_see_a_client_licenses_scans(): void
    {
        ['key' => $key] = $this->mintUserToken();
        ['license' => $client] = $this->mintLicense(siteUrl: 'https://client.test');

        Scan::create([
            'license_id' => $client->id,
            'type' => 'page',
            'status' => 'complete',
            'url' => 'https://client.test/',
        ]);

        $this->getJson('/api/scans', $this->tokenHeaders($key))
            ->assertOk()
            ->assertJsonCount(0, 'scans');
    }

    public function test_a_full_scan_replays_a_supplied_page_list(): void
    {
        Queue::fake();
        ['key' => $key] = $this->mintUserToken();

        $urls = ['https://www.haysmed.com/', 'https://www.haysmed.com/about-us'];

        $this->postJson('/api/scans', ['type' => 'full', 'sitemap_urls' => $urls], $this->tokenHeaders($key))
            ->assertStatus(202);

        Queue::assertPushed(DiscoverSiteUrlsJob::class, fn (DiscoverSiteUrlsJob $job) => $job->suppliedUrls === $urls);
    }

    public function test_the_license_endpoint_reports_the_token_identity(): void
    {
        ['key' => $key, 'user' => $user] = $this->mintUserToken(['www.haysmed.com']);

        $response = $this->getJson('/api/license', $this->tokenHeaders($key));

        $response->assertOk();
        $response->assertJsonPath('token.name', 'Test agent token');
        $response->assertJsonPath('token.user', $user->email);
        $response->assertJsonPath('token.allowed_hosts', ['www.haysmed.com']);
        $response->assertJsonPath('quotas.fullscan_per_day', 20);
    }

    public function test_an_allowlisted_token_refuses_another_host(): void
    {
        Queue::fake();
        ['key' => $key] = $this->mintUserToken(['www.haysmed.com']);

        $this->postJson(
            '/api/scans',
            ['type' => 'page', 'url' => 'https://www.pawneevalleyhospital.com/'],
            $this->tokenHeaders($key)
        )
            ->assertStatus(403)
            ->assertJsonPath('error.code', 'HOST_NOT_ALLOWED');

        Queue::assertNotPushed(RunPageScanJob::class);
    }

    public function test_the_allowlist_also_covers_supplied_sitemap_urls(): void
    {
        Queue::fake();
        ['key' => $key] = $this->mintUserToken(['www.haysmed.com']);

        $this->postJson(
            '/api/scans',
            ['type' => 'full', 'sitemap_urls' => ['https://www.haysmed.com/', 'https://elsewhere.test/']],
            $this->tokenHeaders($key)
        )
            ->assertStatus(403)
            ->assertJsonPath('error.code', 'HOST_NOT_ALLOWED');

        Queue::assertNotPushed(DiscoverSiteUrlsJob::class);
    }

    public function test_host_matching_is_exact_so_www_does_not_cover_the_bare_domain(): void
    {
        Queue::fake();
        ['key' => $key] = $this->mintUserToken(['www.haysmed.com']);

        $this->postJson('/api/scans', ['type' => 'page', 'url' => 'https://haysmed.com/'], $this->tokenHeaders($key))
            ->assertStatus(403)
            ->assertJsonPath('error.code', 'HOST_NOT_ALLOWED');
    }

    public function test_a_revoked_token_is_refused(): void
    {
        ['key' => $key, 'token' => $token] = $this->mintUserToken();
        $token->update(['revoked_at' => now()]);

        $this->getJson('/api/scans', $this->tokenHeaders($key))
            ->assertStatus(403)
            ->assertJsonPath('error.code', 'TOKEN_REVOKED');
    }

    public function test_an_expired_token_is_refused_even_for_reads(): void
    {
        ['key' => $key, 'token' => $token] = $this->mintUserToken();
        $token->forceFill(['expires_at' => now()->subDay()])->save();

        $this->getJson('/api/scans', $this->tokenHeaders($key))
            ->assertStatus(403)
            ->assertJsonPath('error.code', 'TOKEN_EXPIRED');
    }

    public function test_an_unknown_token_is_rejected_without_falling_back_to_license_lookup(): void
    {
        $this->getJson('/api/scans', $this->tokenHeaders('g3u_not-a-real-token'))
            ->assertStatus(401)
            ->assertJsonPath('error.code', 'INVALID_KEY');
    }

    public function test_using_the_token_records_last_used_at(): void
    {
        ['key' => $key, 'token' => $token] = $this->mintUserToken();
        $this->assertNull($token->last_used_at);

        $this->getJson('/api/scans', $this->tokenHeaders($key))->assertOk();

        $this->assertNotNull($token->fresh()->last_used_at);
    }

    public function test_activation_is_refused_for_a_user_token(): void
    {
        ['key' => $key] = $this->mintUserToken();

        $this->postJson('/api/activate', ['site_url' => 'https://www.haysmed.com'], $this->tokenHeaders($key))
            ->assertStatus(400)
            ->assertJsonPath('error.code', 'NOT_APPLICABLE');

        $this->assertSame(0, License::internal()->activations()->count());
    }

    public function test_a_license_key_still_requires_its_site_header(): void
    {
        ['key' => $key] = $this->mintLicense();

        $this->getJson('/api/scans', ['Authorization' => 'Bearer '.$key, 'Accept' => 'application/json'])
            ->assertStatus(400)
            ->assertJsonPath('error.code', 'MISSING_SITE_URL');
    }
}
