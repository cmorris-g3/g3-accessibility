<?php

namespace Tests\Feature\Livewire;

use App\Livewire\Findings\Index as FindingsIndex;
use App\Livewire\Overview;
use App\Livewire\Sites\Index as SitesIndex;
use App\Livewire\Sites\Mint as SitesMint;
use App\Livewire\Sites\Show as SitesShow;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Livewire\Livewire;
use Tests\Support\LicenseHelpers;
use Tests\TestCase;

class DashboardRoutesTest extends TestCase
{
    use RefreshDatabase;
    use LicenseHelpers;

    private function actingAsUser(): User
    {
        $user = User::factory()->create(['email_verified_at' => now()]);
        $this->actingAs($user);
        return $user;
    }

    public function test_overview_renders_for_authenticated_user(): void
    {
        $this->actingAsUser();

        Livewire::test(Overview::class)->assertOk();
    }

    public function test_sites_index_renders(): void
    {
        $this->actingAsUser();
        $this->mintLicense();

        Livewire::test(SitesIndex::class)
            ->assertOk()
            ->assertSee('Mint license');
    }

    public function test_sites_index_search_filters(): void
    {
        $this->actingAsUser();
        $this->mintLicense('https://aaa.com');
        $this->mintLicense('https://bbb.com');

        Livewire::test(SitesIndex::class)
            ->set('search', 'nope-no-match')
            ->assertOk();
    }

    public function test_sites_mint_renders(): void
    {
        $this->actingAsUser();

        Livewire::test(SitesMint::class)
            ->assertOk()
            ->assertSee('Mint a new license');
    }

    public function test_sites_mint_submits_and_shows_key(): void
    {
        $this->actingAsUser();

        Livewire::test(SitesMint::class)
            ->set('name', 'Testco')
            ->set('siteUrl', 'https://testco.example.com')
            ->call('mint')
            ->assertOk()
            ->assertSet('plaintextKey', fn ($key) => is_string($key) && str_starts_with($key, 'g3_'));
    }

    public function test_sites_show_renders(): void
    {
        $this->actingAsUser();
        ['license' => $license] = $this->mintLicense();

        Livewire::test(SitesShow::class, ['license' => $license])
            ->assertOk()
            ->assertSee($license->name);
    }

    public function test_sites_show_suspend_toggle(): void
    {
        $this->actingAsUser();
        ['license' => $license] = $this->mintLicense();

        Livewire::test(SitesShow::class, ['license' => $license])
            ->call('suspend');

        $this->assertSame('suspended', $license->fresh()->status);
    }

    public function test_findings_index_renders(): void
    {
        $this->actingAsUser();
        $this->mintLicense();

        Livewire::test(FindingsIndex::class)->assertOk();
    }

    public function test_routes_redirect_unauthenticated(): void
    {
        $this->get(route('sites.index'))->assertRedirect();
        $this->get(route('findings.index'))->assertRedirect();
    }
}
